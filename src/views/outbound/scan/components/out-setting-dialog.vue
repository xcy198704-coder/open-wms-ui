<template>
  <el-dialog v-model="currentDialogVisible" :top="common.getDialogTop()" title="应用场景设置" class="dialog-container" width="1000px" draggable overflow append-to-body>
    <div class="setting-container">
      <div class="container-left">
        <div class="left-item">
          <div class="item-title">扫单出库</div>
          <div class="item--sub-title">扫描出库单号直接出库，极简模式，无需核验条码</div>
        </div>
        <div class="left-item">
          <div class="item-title">验码出库</div>
          <div class="item--sub-title">扫描出库单号后，需要校验条码</div>
        </div>
        <div class="left-item">
          <div class="item-title">多品一箱</div>
          <div class="item--sub-title">扫描出库单号后，进行混合装箱操作</div>
        </div>
        <div class="left-item">
          <div class="item-title">一品一箱</div>
          <div class="item--sub-title">扫描出库单号后，进行一个商品装一下操作</div>
        </div>
      </div>
      <div class="container-right">
        <el-form :model="state.config" label-width="120px">
          <el-form-item label="商品校验">
            <el-switch v-model="state.config.isValidateProductCode" />
          </el-form-item>
          <el-form-item label="开启包材">
            <el-switch v-model="state.config.isOpenWrapperBarcode" />
          </el-form-item>
          <el-form-item label="开启多包材">
            <el-switch v-model="state.config.isManyWrapperBarcode" />
          </el-form-item>
          <el-form-item label="装箱模式">
            <el-radio-group v-model="state.config.caseMode" @change="caseModeChange">
              <el-radio :label="0">未开启</el-radio>
              <el-radio :label="1">一品一箱</el-radio>
              <el-radio :label="2">多品一箱</el-radio>
              <el-radio :label="3">多单一箱</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="打印单据">
            <el-checkbox-group v-model="state.config.printBill">
              <el-checkbox value="expressBill" name="type">打印物流面单</el-checkbox>
              <el-checkbox value="orderList" name="type">打印出库清单</el-checkbox>
              <el-checkbox value="caseList" name="type">打印装箱清单</el-checkbox>
              <el-checkbox value="caseLabel" name="type">打印箱标签</el-checkbox>
              <el-checkbox value="caseNumber" name="type">打印箱号</el-checkbox>
            </el-checkbox-group>
          </el-form-item>
          <el-form-item label="打印模板设置">
            <el-table :data="state.config.billPrintSettings" style="width: 100%" size="normal">
              <el-table-column prop="index" label="序号" align="center" width="65" />
              <el-table-column prop="name" label="打印名称" width="120" />
              <el-table-column prop="template" label="关联模板" width="180">
                <template #default="{ row }">
                  <el-select v-model="row.templateName" placeholder="选择打印模板" style="width: 100%">
                    <el-option v-for="item in getTemplateListFilter(row.templateType)" :key="item.printTemplateId" :label="item.templateName" :value="item.printTemplateId" />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column prop="printName" label="打印机名称">
                <template #default="{ row }">
                  <el-select v-model="row.printName" placeholder="选择打印机" style="width: 100%">
                    <el-option v-for="item in state.printList" :key="item.printName" :label="item.printName" :value="item.printName" />
                  </el-select>
                </template>
              </el-table-column>
            </el-table>
          </el-form-item>
        </el-form>
      </div>
    </div>
    <template #footer>
      <span class="flex-end">
        <el-button @click="currentDialogVisible = false">取 消</el-button>
        <el-button :loading="state.isLoading" type="primary" icon="ele-Select" @click="save">保存</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts" name="inbound-scan-order">
import { ComponentInternalInstance } from 'vue';
import { BaseProperties } from '/@/types/base-type';
let ins = getCurrentInstance() as ComponentInternalInstance;
let proxy: BaseProperties = ins.proxy as BaseProperties;
import { getLodop } from '/@/utils/LodopFuncs.js';
import { DataType, QueryBo, QueryType } from '/@/types/common';
import { postData } from '/@/api/common/baseApi';
import to from 'await-to-js';
import common from '/@/utils/common';
import { UserCacheEnum } from '/@/enums/UserCacheEnum';
// 事件定义
const emit = defineEmits(['update:visible', 'scan-setting-change']);

//#region 定义属性
const props = defineProps({
  // 是否显示
  visible: {
    type: Boolean,
    default: false,
  },
  // 名称
  name: {
    type: String,
  },
  // 配置参数
  scanSetting: {
    type: Object,
  },
});
//#endregion

//#region 定义变量
const state = reactive({
  // 当前选中菜单下的导出模板列表
  vueDataList: [],
  // 当前选中模板
  currentTemplate: {},
  isLoading: false,
  config: {
    isValidateProductCode: true,
    isOpenWrapperBarcode: false,
    isManyWrapperBarcode: false,
    isOpenCase: false,
    printBill: [],
    caseMode: 0,
    billPrintSettings: [
      {
        index: 1,
        name: '打印物流面单',
        templateType: '物流单',
        templateName: '',
        printName: '',
      },
      {
        index: 1,
        name: '打印箱标签',
        templateType: '箱标签',
        templateName: '',
        printName: '',
      },
      {
        index: 2,
        name: '打印装箱清单',
        templateType: '订单详情',
        templateName: '',
        printName: '',
      },
      {
        index: 3,
        name: '打印出库清单',
        templateType: '订单详情',
        templateName: '',
        printName: '',
      },
      {
        index: 4,
        name: '打印箱号',
        templateType: '箱标签',
        templateName: '',
        printName: '',
      },
    ],
  },
  templateList: [] as Array<Record<string, any>>,
  printList: [] as Array<Record<string, any>>,
});
//#endregion

//#region 计算属性
// 显示窗口
const currentDialogVisible = computed({
  get() {
    return props.visible;
  },
  set(val) {
    emit('update:visible', val);
  },
});
//#endregion

watch(
  () => props.scanSetting,
  (val: any) => {
    if (!val.billPrintSettings) val.billPrintSettings = state.config.billPrintSettings;
    if (val.caseMode === undefined) {
      val.caseMode = 0;
      val.isOpenCase = false;
    }
    if (!val.printBill) val.printBill = [];
    state.config = val;
  },
  { deep: true, immediate: true }
);

onMounted(async () => {
  await getPrintList();
  await getTemplateList();
});

// 获得打印机列表
const getPrintList = () => {
  window.setTimeout(() => {
    const LODOP = getLodop();
    var iPrinterCount = LODOP.GET_PRINTER_COUNT();
    for (var i = 0; i < iPrinterCount; i++) {
      state.printList.push({
        index: i,
        printName: LODOP.GET_PRINTER_NAME(i),
      });
    }
  }, 1000);
};

// 获取打印模板
const getTemplateList = async () => {
  // 多条件查询
  let queryBoList: Array<QueryBo> = [
    {
      column: 'select',
      values: 'printTemplateId,templateName,templateType',
      queryType: QueryType.SELECT,
      dataType: DataType.STRING,
    },
    {
      column: 'templateType',
      values: '物流单,订单详情,箱标签',
      queryType: QueryType.IN,
      dataType: DataType.STRING,
    },
  ];

  let url = '/system/core/printTemplate/selectList';
  let params = queryBoList;

  const [err, res] = await to(postData(url, params));
  if (err) {
    return;
  }

  if (res.result) {
    state.templateList = res.data;
  }
};

const getTemplateListFilter = (type: string) => {
  return state.templateList.filter((item) => item.templateType === type);
};

const save = async () => {
  currentDialogVisible.value = false;
  await common.setUserCache(UserCacheEnum.SCAN_OUT_SETTING, props.scanSetting); // 保持设置
  emit('scan-setting-change', { config: state.config });
};

const caseModeChange = () => {
  state.config.isOpenCase = !!state.config.caseMode;
};
</script>

<style lang="scss" scoped>
.setting-container {
  display: flex;
  flex-direction: row;
  .container-left {
    width: 200px;
    border-right: 1px solid rgb(228, 228, 228);
    padding: 0 10px 0 0;
    .left-item {
      width: 180px;
      height: 93px;
      border-radius: 12px;
      background-image: linear-gradient(-65deg, rgba(99, 216, 255, 0.07) 0, rgba(82, 64, 255, 0.07) 100%);
      padding: 10px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      margin-bottom: 10px;
      transition: all 0.6s;
      &:hover {
        transform: translateZ(0) scale(1.05);
        background-image: linear-gradient(-65deg, rgba(255, 165, 47, 0.671) 0, rgba(20, 179, 49, 0.671) 100%);
        color: #fff;
        .item--sub-title {
          color: #fff;
        }
      }
      &.active {
        background-image: linear-gradient(-65deg, rgba(255, 165, 47, 0.671) 0, rgba(20, 179, 49, 0.671) 100%);
        color: #fff;
        .item--sub-title {
          color: #fff;
        }
      }
      cursor: pointer;
      .item-title {
        display: flex;
        font-size: 18px;
        width: 100%;
        line-height: 1.5;
      }
      .item--sub-title {
        transition: all 0.6s;
        display: flex;
        font-size: 14px;
        color: #8d8d8d;
      }
    }
  }
  .container-right {
    flex: 1;
  }
}
</style>
