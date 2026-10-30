// headless 入口（SPEC §4.6）：
// - unhandledRejection 只打印；uncaughtException 打印后 process.exit(1)（交给外层守护重启）
// - SIGINT → await stop() → exit(0)（不创建窗口，控制台用浏览器打开）
import { createApplication } from './kernel/composition.js';

process.on('unhandledRejection', (err) => {
  console.error('[server] unhandledRejection：', err);
});
process.on('uncaughtException', (err) => {
  console.error('[server] uncaughtException：', err);
  process.exit(1); // "半死不活地挂着"最难排查，宁可死得明白（SPEC §4.5 同口径）
});

const kernel = await createApplication({ headless: true });

kernel.start().then((port) => {
  console.log(`\n  QQ Agent ${kernel.VERSION} · headless`);
  console.log(`  控制台：http://127.0.0.1:${port}/\n`);

  const shutdown = async (sig) => {
    console.log(`\n[server] 收到 ${sig}，清理退出…`);
    try {
      await kernel.stop();
      process.exit(0);
    } catch (err) {
      console.error('[server] 清理异常：', err);
      process.exit(1);
    }
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}).catch((err) => {
  console.error('[server] 启动失败：', err);
  process.exit(1);
});
