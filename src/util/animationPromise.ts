export const nextAnimationFrame = () =>
  new Promise<number>((resolve) => {
    const start = Date.now();
    requestAnimationFrame(() => {
      const now = Date.now();
      resolve(now - start);
    });
  });
