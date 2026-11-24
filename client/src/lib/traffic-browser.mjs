// One boolean per page. No key, coordinates, text or additional identifier leaves the browser.
export function observeTraffic(send, win = window) {
  let done = false, scrollInput = false;
  const listeners = [];
  const on = (type, fn) => { win.addEventListener(type, fn, { passive: true }); listeners.push([type, fn]); };
  const cleanup = () => { for (const [type, fn] of listeners) win.removeEventListener(type, fn); };
  const interact = event => {
    if (done || event.isTrusted !== true) return;
    done = true; cleanup(); send({ path: win.location.pathname, scriptRan: true, interacted: true });
  };
  on('pointerdown', interact);
  on('keydown', interact);
  on('wheel', event => { if (event.isTrusted === true) scrollInput = true; });
  on('touchmove', event => { if (event.isTrusted === true) scrollInput = true; });
  on('scroll', event => {
    const distance = win.document.documentElement.scrollHeight - win.innerHeight;
    if (scrollInput && distance > 0 && win.scrollY / distance > 0.25) interact(event);
  });
  send({ path: win.location.pathname, scriptRan: true, interacted: false });
  return cleanup;
}
