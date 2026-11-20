// echarts 按需入口：只注册项目实际用到的图表与组件，
// 避免 `import * as echarts from 'echarts'` 把整包（~800 KB）打进产物。
// 新增图表类型/组件时在这里补充注册。
import * as echarts from 'echarts/core';
import { BarChart, GaugeChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TitleComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
	BarChart,
	GaugeChart,
	LineChart,
	PieChart,
	GridComponent,
	LegendComponent,
	TitleComponent,
	TooltipComponent,
	CanvasRenderer,
]);

export * from 'echarts/core';
export default echarts;
