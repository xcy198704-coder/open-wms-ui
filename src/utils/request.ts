import axios, { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { useUserStore } from '/@/stores/modules/user';
import { getToken } from '/@/utils/auth';
import { tansParams, blobValidate } from '/@/utils/ruoyi';
import cache from '/@/plugins/cache';
import { HttpStatus } from '/@/enums/RespEnum';
import { errorCode } from '/@/utils/errorCode';
import { LoadingInstance } from 'element-plus/es/components/loading/src/loading';
import FileSaver from 'file-saver';
import ElLoading from 'element-plus/es/components/loading/index';
import { ElMessage } from 'element-plus/es/components/message/index';
import { ElMessageBox } from 'element-plus/es/components/message-box/index';
import { ElNotification } from 'element-plus/es/components/notification/index';
import { encryptBase64, encryptWithAes, generateAesKey } from '/@/utils/crypto';
import { encrypt } from '/@/utils/jsencrypt';
import { getLanguage } from '/@/i18n';
import { Session } from './storage';
import { Constants } from './constants';

let requestLoadingInstance: LoadingInstance | null = null;
let downloadLoadingInstance: LoadingInstance;
let isShowErrorMessage: boolean = false; // 防止重复显示错误信息

// 全屏 loading 引用计数：并发请求只显示一个遮罩，全部结束才关闭；
// 且请求在 400ms 内返回时完全不显示，避免快速接口造成"闪一下"的卡顿感
let requestLoadingCount = 0;
let requestLoadingTimer: ReturnType<typeof setTimeout> | null = null;
const LOADING_DELAY = 400;

const showRequestLoading = () => {
  requestLoadingCount++;
  if (requestLoadingCount === 1 && !requestLoadingTimer && !requestLoadingInstance) {
    requestLoadingTimer = setTimeout(() => {
      requestLoadingTimer = null;
      if (requestLoadingCount > 0 && !requestLoadingInstance) {
        requestLoadingInstance = ElLoading.service({ text: '数据处理中，请稍候', background: 'rgba(0, 0, 0, 0.3)' });
      }
    }, LOADING_DELAY);
  }
};

const hideRequestLoading = () => {
  requestLoadingCount = Math.max(0, requestLoadingCount - 1);
  if (requestLoadingCount === 0) {
    if (requestLoadingTimer) {
      clearTimeout(requestLoadingTimer);
      requestLoadingTimer = null;
    }
    if (requestLoadingInstance) {
      requestLoadingInstance.close();
      requestLoadingInstance = null;
    }
  }
};

// 仅回收"本次请求确实开启过 loading"的情况，避免 noLoading 请求误减计数
const releaseRequestLoading = (config?: any) => {
  if (config && config.__loadingShown) {
    config.__loadingShown = false;
    hideRequestLoading();
  }
};

// 是否显示重新登录
export const isRelogin = { show: false };
export const globalHeaders = () => {
  return {
    Authorization: 'Bearer ' + getToken(),
    clientid: import.meta.env.VITE_APP_CLIENT_ID,
  };
};

axios.defaults.headers['Content-Type'] = 'application/json;charset=utf-8';
axios.defaults.headers['clientid'] = import.meta.env.VITE_APP_CLIENT_ID;
// 创建 axios 实例
const service = axios.create({
  baseURL: import.meta.env.VITE_APP_BASE_API,
  timeout: 3 * 60 * 1000,
});

// 请求拦截器
service.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 对应国际化资源文件后缀
    config.headers['Content-Language'] = getLanguage();
    // webSocketSessionId
    config.headers.webSocketSessionId = Session.get(Constants.WEB_SOCKET_SESSION_ID);

    // magic-api根路径
    if (config.url && config.url.startsWith('/magic-api')) {
      config.baseURL = '';
    }

    // 不显示loading提示（调用方有的传字符串 'true'，有的直接传布尔 true）
    const noLoadingHeader = (config.headers || {}).noLoading;
    const noLoading = noLoadingHeader === 'true' || noLoadingHeader === true;
    const isToken = (config.headers || {}).isToken === false;
    // 是否需要防止数据重复提交
    const isNoRepeatSubmit = (config.headers || {}).repeatSubmit === false;
    // 是否需要加密
    const isEncrypt = (config.headers || {}).isEncrypt === 'true';
    let token = getToken();
    if (token && !isToken) {
      let { token: userToken } = useUserStore();
      // 验证token是否变化
      if (token !== userToken) {
        return Promise.reject(new Error('token is changed'));
      }
      config.headers['Authorization'] = 'Bearer ' + token; // 让每个请求携带自定义token 请根据实际情况自行修改
    }
    // get请求映射params参数
    if (config.method === 'get' && config.params) {
      let url = config.url + '?' + tansParams(config.params);
      url = url.slice(0, -1);
      config.params = {};
      config.url = url;
    }

    if (!isNoRepeatSubmit && (config.method === 'post' || config.method === 'put')) {
      const requestObj = {
        url: config.url,
        data: typeof config.data === 'object' ? JSON.stringify(config.data) : config.data,
        time: new Date().getTime(),
      };
      const sessionObj = cache.session.getJSON('sessionObj');
      if (sessionObj === undefined || sessionObj === null || sessionObj === '') {
        cache.session.setJSON('sessionObj', requestObj);
      } else {
        const s_url = sessionObj.url; // 请求地址
        const s_data = sessionObj.data; // 请求数据
        const s_time = sessionObj.time; // 请求时间
        const interval = 500; // 间隔时间(ms)，小于此时间视为重复提交
        if (s_data === requestObj.data && requestObj.time - s_time < interval && s_url === requestObj.url) {
          const message = requestObj.url + '数据正在处理，请勿重复提交';
          console.warn(`[${s_url}]: ` + message);
          return Promise.reject(new Error(message));
        } else {
          cache.session.setJSON('sessionObj', requestObj);
        }
      }
    }
    // 当开启参数加密
    if (isEncrypt && (config.method === 'post' || config.method === 'put')) {
      // 生成一个 AES 密钥
      const aesKey = generateAesKey();
      config.headers['encrypt-key'] = encrypt(encryptBase64(aesKey));
      config.data = typeof config.data === 'object' ? encryptWithAes(JSON.stringify(config.data), aesKey) : encryptWithAes(config.data, aesKey);
      // debugger;
      // console.log('encrypt-key=', config.headers['encrypt-key']);
      // console.log('encrypt-data=', config.data);
    }
    // FormData数据去请求头Content-Type
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    // 放在最后：被上面逻辑拦截（重复提交/token变更）的请求不会显示 loading，也就不用回收
    if (!noLoading) {
      showRequestLoading();
      (config as any).__loadingShown = true;
    }
    return config;
  },
  (error: any) => {
    releaseRequestLoading(error?.config);
    console.log(error);
    return Promise.reject(error);
  }
);

// 响应拦截器
service.interceptors.response.use(
  async (res: AxiosResponse) => {
    releaseRequestLoading(res.config);
    // 未设置状态码则默认成功状态
    const code = res.data.code || HttpStatus.SUCCESS;
    if (!res.data.msg && res.data.message) {
      res.data.msg = res.data.message;
    }
    // 获取错误信息
    const msg = errorCode[code] || res.data.msg || errorCode['default'];
    // 数据处理
    const dataResult = () => {
      let { result, code, data, msg, rows, total, footer } = res.data;
      let _data = data !== undefined ? data : res.data;
      if (result === undefined) result = true;
      let _res: any = {
        result: result,
        code: code,
        msg: msg,
        type: undefined,
        data: _data,
      };
      if (rows) _res.rows = rows;
      if (total) _res.total = total;
      if (footer) _res.footer = footer;

      return _res;
    };

    // 二进制数据则直接返回
    if (res.request.responseType === 'blob' || res.request.responseType === 'arraybuffer') {
      const contentDisposition = res.headers['content-disposition'];
      const fileName = decodeURI(contentDisposition.replace("attachment;filename*=utf-8''", ''));
      res.data.fileName = fileName;
      return res.data;
    }
    if (code === HttpStatus.UNAUTHORIZED) {
      isRelogin.show = false;
      await useUserStore().logout();
      // const route = window.route;
      // location.href = `/login?redirect=${route.path}&params=${JSON.stringify(route.query ? route.query : route.params)}`;
      return Promise.resolve({
        result: false,
        code: HttpStatus.UNAUTHORIZED,
        msg: '系统未授权，请重新登录',
      });
    } else if (code === HttpStatus.SERVER_ERROR) {
      console.log(msg);
      ElMessage({ message: msg, type: 'error' });
      return Promise.reject(new Error(msg));
    } else if (code === HttpStatus.WARN) {
      ElMessage({ message: msg, type: 'warning' });
      let result = dataResult();
      result.message = msg;
      return Promise.reject(result);
    } else if (code !== HttpStatus.SUCCESS) {
      ElNotification.error({ title: msg });
      return Promise.reject('error');
    } else {
      return Promise.resolve(dataResult());
    }
  },
  (error: any) => {
    releaseRequestLoading(error?.config);
    let { message } = error;
    if (message == 'Network Error') {
      message = '后端接口连接异常';
    } else if (message.includes('timeout')) {
      message = '系统接口请求超时';
    } else if (message.includes('token is changed')) {
      message = 'token发生变化，即将刷新页面！';
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } else if (message.includes('Request failed with status code')) {
      message = '系统接口' + message.substr(message.length - 3) + '异常';
    }
    if (message && message.indexOf('重复提交') === -1 && !isShowErrorMessage) {
      ElMessage({ message: message, type: 'error', duration: 5 * 1000 });
      isShowErrorMessage = true;
      setTimeout(() => {
        isShowErrorMessage = false;
      }, 500);
    }
    return Promise.reject(error);
  }
);
// 通用下载方法
export function download(url: string, params: any, fileName?: string) {
  downloadLoadingInstance = ElLoading.service({ text: '正在下载数据，请稍候', background: 'rgba(0, 0, 0, 0.3)' });
  // prettier-ignore
  return service.post(url, params, {
      transformRequest: [
        (params: any) => {
          return tansParams(params);
        }
      ],
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      responseType: 'blob'
    }).then(async (resp: any) => {
      let _fileName = resp.fileName || fileName || `模板${new Date().getTime()}.xlsx`;
      const isLogin = blobValidate(resp);
      if (isLogin) {
        const blob = new Blob([resp]);
        FileSaver.saveAs(blob, _fileName);
      } else {
        const resText = await resp.data.text();
        const rspObj = JSON.parse(resText);
        const errMsg = errorCode[rspObj.code] || rspObj.msg || errorCode['default'];
        ElMessage.error(errMsg);
      }
      downloadLoadingInstance.close();
    }).catch((r: any) => {
      console.error(r);
      ElMessage.error('下载文件出现错误，请联系管理员！');
      downloadLoadingInstance.close();
    });
}
// 导出 axios 实例
export default service;
