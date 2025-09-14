/**
 * Minimal game bootstrap used by the lobby page.
 *
 * Exports:
 *   - bootstrapGame(container: HTMLElement, options)
 *
 * bootstrapGame mounts a simple canvas placeholder (DOM) inside the container
 * and returns an object with sendInput(input) which forwards input to the
 * provided peer.send(...) if available.
 *
 * This file intentionally keeps things tiny — it's only used to demonstrate
 * message flow between peers via the DataChannel.
 */

export type BootstrapOptions = {
  peer?: { send: (obj: any) => void; sendInput?: (input: any, playerId: string, tick: number) => void } | null;
  playerId?: string;
};

export type GameHandle = {
  sendInput(input: any): void;
  destroy(): void;
  onSnapshot?: (cb: (snapshot: any) => void) => void;
};

export function bootstrapGame(container: HTMLElement, options?: BootstrapOptions): GameHandle {
  const playerId = options?.playerId || 'local-player';
  let currentTick = 0;
  let inputSamplingInterval: number | null = null;
  const snapshotCallbacks: ((snapshot: any) => void)[] = [];
  const wrapper = document.createElement("div");
  wrapper.style.width = "100%";
  wrapper.style.height = "100%";
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.alignItems = "stretch";
  wrapper.style.justifyContent = "flex-start";
  wrapper.style.gap = "8px";
  wrapper.style.padding = "8px";
  wrapper.style.boxSizing = "border-box";
  container.appendChild(wrapper);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(320, container.clientWidth);
  canvas.height = Math.max(200, container.clientHeight);
  canvas.style.background = "#000";
  canvas.style.width = "100%";
  canvas.style.height = "auto";
  canvas.style.border = "1px solid #444";
  wrapper.appendChild(canvas);

  const info = document.createElement("div");
  info.style.color = "#fff";
  info.style.fontSize = "12px";
  info.textContent = "Canvas placeholder (no game engine).";
  wrapper.appendChild(info);

  const inputRow = document.createElement("div");
  inputRow.style.display = "flex";
  inputRow.style.gap = "8px";
  wrapper.appendChild(inputRow);

  const input = document.createElement("input");
  input.placeholder = "Type input to send to peer (e.g. move, press)";
  input.style.flex = "1";
  inputRow.appendChild(input);

  const sendBtn = document.createElement("button");
  sendBtn.textContent = "Send Input";
  inputRow.appendChild(sendBtn);

  // draw a simple rectangle to show something happening
  const ctx = canvas.getContext("2d");
  let t = 0;
  let raf = 0;
  function render() {
    if (!ctx) return;
    t += 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0f0";
    const x = 20 + ((t * 2) % (canvas.width - 40));
    ctx.fillRect(x, canvas.height / 2 - 10, 30, 20);
    raf = requestAnimationFrame(render);
  }
  raf = requestAnimationFrame(render);

  sendBtn.onclick = () => {
    const val = input.value.trim();
    if (!val) return;
    const payload = { type: "input", payload: val, ts: Date.now() };
    if (options?.peer && typeof options.peer.send === "function") {
      try {
        options.peer.send(payload);
      } catch (e) {
        console.warn("peer.send failed", e);
      }
    }
  };

  function sendInput(inputObj: any) {
    if (options?.peer && typeof options.peer.send === "function") {
      try {
        options.peer.send(inputObj);
      } catch (e) {
        console.warn("peer.send failed", e);
      }
    }
    // Send input via sendInput helper if available (for structured input messages)
    if (options?.peer && typeof options.peer.sendInput === "function") {
      try {
        options.peer.sendInput(inputObj, playerId, currentTick);
        currentTick++;
      } catch (e) {
        console.warn("peer.sendInput failed", e);
      }
    }
  }

  function destroy() {
    cancelAnimationFrame(raf);
    if (inputSamplingInterval) {
      clearInterval(inputSamplingInterval);
      inputSamplingInterval = null;
    }
    try {
      container.removeChild(wrapper);
    } catch {}
  }

  // Start input sampling at ~30Hz
  inputSamplingInterval = window.setInterval(() => {
    // Sample input and send it
    // For now, just send empty input to maintain tick sequence
    sendInput({});
  }, 33); // ~30Hz

  function onSnapshot(cb: (snapshot: any) => void) {
    snapshotCallbacks.push(cb);
  }

  // Export onSnapshot for external use
  const handle: GameHandle = { sendInput, destroy, onSnapshot };

  return handle;
}