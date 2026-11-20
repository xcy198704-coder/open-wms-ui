import { inject, onUnmounted, provide, ref, watch } from 'vue';
import type { Ref } from 'vue';

// 看板自动刷新：页面调用 useBoardRefresh() 开启定时器，
// 子组件调用 onBoardRefresh(fn) 注册刷新回调，避免整页重挂载造成闪烁。
const BOARD_REFRESH_KEY = 'boardRefreshTick';

// 默认 30 秒；需要调整时在页面里传入间隔（毫秒）
export const DEFAULT_REFRESH_MS = 30000;

/**
 * 看板页调用：按固定间隔递增 tick，通知子组件重新取数
 * @param intervalMs 刷新间隔，默认 30 秒
 */
export function useBoardRefresh(intervalMs: number = DEFAULT_REFRESH_MS) {
	const tick = ref(0);
	const timer = window.setInterval(() => {
		tick.value++;
	}, intervalMs);
	onUnmounted(() => window.clearInterval(timer));
	provide(BOARD_REFRESH_KEY, tick);
	return { tick, intervalMs };
}

/**
 * 看板组件调用：每次刷新 tick 变化时执行回调；无需 import vue 的 inject/watch
 * @param refresh 重新取数的方法
 */
export function onBoardRefresh(refresh: () => void | Promise<void>) {
	const tick = inject<Ref<number> | null>(BOARD_REFRESH_KEY, null);
	if (!tick) return;
	let running = false;
	watch(tick, async () => {
		// 上一次还没返回就跳过，避免慢接口时请求堆积
		if (running) return;
		running = true;
		try {
			await refresh();
		} finally {
			running = false;
		}
	});
}
