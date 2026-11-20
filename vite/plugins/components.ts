import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';
import IconsResolver from 'unplugin-icons/resolver';

export default (path: any) => {
	return Components({
		resolvers: [
			// 自动导入 Element Plus 组件
			// directives 交给 src/main.ts 全局注册，避免解析器注入 element-plus/es 整包入口
			ElementPlusResolver({ directives: false }),
			// 自动注册图标组件
			IconsResolver({
				enabledCollections: ['ep'],
			}),
		],
		dts: path.resolve(path.resolve(__dirname, '../../src'), 'types', 'components.d.ts'),
	});
};
