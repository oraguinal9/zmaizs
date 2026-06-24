"use client";

import { useEffect, useRef, forwardRef, useState } from "react";

export interface VRMHandle {
  setMouthOpen: (r: number) => void;
  playEmotion: (e: string) => void;
}

interface Props {
  modelPath?: string;
  rotationY?: number;
  armAngle?: number;
}

const VRMCharacter = forwardRef<VRMHandle, Props>(function VRMCharacter({ modelPath = "/models/xiaoxiao.vrm", rotationY, armAngle }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const vrmRef = useRef<any>(null);
  const renRef = useRef<any>(null);
  const camRef = useRef<any>(null);
  const [msg, setMsg] = useState("加载中...");
  const blinkTimerRef = useRef(0);
  const nextBlinkRef = useRef(3000);

  // 暴露方法给父组件
  useEffect(() => {
    (ref as any).current = {
      setMouthOpen: (r: number) => {
        try { vrmRef.current?.expressionManager?.setValue("aa", Math.min(r, 1)); } catch {}
      },
      playEmotion: (e: string) => {
        try {
          const em = vrmRef.current?.expressionManager;
          if (em) { em.setValue(e, 1); setTimeout(() => { try { em.setValue(e, 0); } catch {} }, 2000); }
        } catch {}
      },
    };
  }, [ref]);

  useEffect(() => {
    let ok = true, aid = 0;

    async function init() {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;

      const THREE = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const { VRMLoaderPlugin, VRMUtils } = await import("@pixiv/three-vrm");

      const w = canvas.clientWidth || 360;
      const h = canvas.clientHeight || 480;
      if (!ok) return;

      const ren = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      ren.setSize(w, h);
      ren.setPixelRatio(Math.min(devicePixelRatio, 2));
      renRef.current = ren;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xfef2f8);

      const aspect = w / h;
      const fov = aspect < 1 ? 42 : 35; // 竖屏加宽视场角
      const cam = new THREE.PerspectiveCamera(fov, aspect, 0.05, 15);
      cam.position.set(0, 1.2, 2.6);
      cam.lookAt(0, 0.95, 0);
      camRef.current = cam;

      scene.add(new THREE.AmbientLight(0xffffff, 2.0));
      scene.add(new THREE.DirectionalLight(0xfff0f5, 2.5));

      setMsg("下载模型中...");

      try {
        const loader = new GLTFLoader();
        loader.register((p: any) => new VRMLoaderPlugin(p));

        const gltf: any = await new Promise((ok, no) => {
          loader.load(modelPath, ok, (e: any) => {
            if (e.total) setMsg(`下载 ${Math.round(e.loaded/1024/1024)}/${Math.round(e.total/1024/1024)} MB`);
          }, (e: any) => {
            console.error("Load error:", e);
            no(e);
          });
        });
        if (!ok) return;

        const vrm = gltf.userData.vrm;
        VRMUtils.rotateVRM0(vrm);

        // 包围盒计算缩放和Y轴居中（XZ强制归零，视觉对齐）
        const bb = new THREE.Box3().setFromObject(vrm.scene);
        const center = new THREE.Vector3();
        bb.getCenter(center);
        const h2 = bb.max.y - bb.min.y;
        const s = Math.min(1.6 / h2, 2.5);
        if (h2 > 0) vrm.scene.scale.setScalar(s);
        // XZ归零保证与页面中轴对齐，Y用包围盒居中
        vrm.scene.position.set(0, -center.y * s + 0.85, 0);

        // 旋转面向相机
        vrm.scene.rotation.y = rotationY ?? Math.PI;

        // 手臂自然下垂
        const humanoid = vrm.humanoid;
        if (humanoid) {
          humanoid.autoUpdateHumanBones = false;
          const lUp = humanoid.getRawBoneNode("leftUpperArm");
          const rUp = humanoid.getRawBoneNode("rightUpperArm");
          const lLo = humanoid.getRawBoneNode("leftLowerArm");
          const rLo = humanoid.getRawBoneNode("rightLowerArm");
          const angle = armAngle ?? 1.2;
          const zAxis = new THREE.Vector3(0, 0, 1);
          if (lUp) lUp.rotateOnWorldAxis(zAxis, angle);
          if (rUp) rUp.rotateOnWorldAxis(zAxis, -angle);
          if (lLo) lLo.rotateOnWorldAxis(zAxis, angle * 0.3);
          if (rLo) rLo.rotateOnWorldAxis(zAxis, -angle * 0.3);
        }

        // 用父容器分离基础朝向和动画摇摆
        const wrapper = new THREE.Group();
        wrapper.add(vrm.scene);
        scene.add(wrapper);
        // 保存 wrapper 引用供 render loop 做摇摆动画
        (vrm as any)._wrapper = wrapper;

        vrmRef.current = vrm;
        setMsg("");
      } catch(e: any) {
        console.error("Fail:", e);
        setMsg("加载失败: " + (e.message||String(e)).slice(0, 100));
        return;
      }

      // Render loop — 包含眨眼 + 呼吸
      let lastTime = Date.now();
      function tick() {
        if (!ok) return;
        aid = requestAnimationFrame(tick);
        try {
          const now = Date.now();
          const dt = now - lastTime;
          lastTime = now;

          const v = vrmRef.current;
          if (v) {
            v.update(0.016);

            // 眨眼
            blinkTimerRef.current += dt;
            if (blinkTimerRef.current >= nextBlinkRef.current) {
              blinkTimerRef.current = 0;
              nextBlinkRef.current = 2500 + Math.random() * 4000; // 2.5~6.5秒随机
              const em = v.expressionManager;
              if (em) {
                try { em.setValue("blink", 1); } catch {}
                setTimeout(() => { try { em?.setValue("blink", 0); } catch {} }, 120);
              }
            }

            // 呼吸浮动 + 轻微身体摇摆（动画加在 wrapper 上）
            // 用绝对定位而非累积，避免浮点漂移
            const t = now * 0.001;
            const wrapper = (v as any)._wrapper;
            if (wrapper) {
              wrapper.position.y = Math.sin(t * 0.7) * 0.015;
              wrapper.rotation.z = Math.sin(t * 0.5) * 0.02;
              wrapper.rotation.y = Math.sin(t * 0.4) * 0.03;
            }
          }
          ren.render(scene, cam);
        } catch {}
      }
      tick();
    }

    init();
    return () => { ok = false; if (aid) cancelAnimationFrame(aid); };
  }, [modelPath]);

  // 响应容器尺寸变化（横竖屏切换、键盘弹出等）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const ren = renRef.current;
        const cam = camRef.current;
        const canvas = canvasRef.current;
        if (!ren || !cam || !canvas) return;
        const w = el.clientWidth || 360;
        const h = el.clientHeight || 480;
        if (w <= 0 || h <= 0) return;
        ren.setSize(w, h);
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      }, 50);
    });
    ro.observe(el);
    return () => { ro.disconnect(); clearTimeout(timer); };
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-gradient-to-b from-pink-100 via-purple-50 to-white overflow-hidden flex items-center justify-center">
      {msg && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-pink-50">
          <div className="text-center"><div className="text-5xl animate-bounce">💕</div><p className="text-sm text-gray-400 mt-2 break-words max-w-[260px]">{msg}</p></div>
        </div>
      )}
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
});

export default VRMCharacter;
