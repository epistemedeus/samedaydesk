export function observeTraffic(send: (value: { path: string; scriptRan: true; interacted: boolean }) => void): () => void;
