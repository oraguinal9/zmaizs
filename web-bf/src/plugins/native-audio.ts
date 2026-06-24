// 通过URL拦截触发原生MediaPlayer (shouldOverrideUrlLoading)
// 最可靠方案——不需要bridge，不需要用户手势

export function nativePlay(url: string): boolean {
  try {
    // 用iframe避免页面跳转
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = `nativeaudio://play?url=${encodeURIComponent(url)}`;
    document.body.appendChild(iframe);
    setTimeout(() => iframe.remove(), 1000);
    return true;
  } catch {
    return false;
  }
}

export function nativeStop(): void {}
