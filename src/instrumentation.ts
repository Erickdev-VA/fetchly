export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startYtDlpAutoUpdate } = await import("./lib/ytdlp/updater");
    startYtDlpAutoUpdate();
  }
}
