<template>
  <div class="biz-container box-pack-scan-page">
    <el-card shadow="never">
      <el-form :inline="true">
        <el-form-item label="出库单号">
          <el-input ref="orderCodeRef" v-model="state.orderCode" style="width: 220px" @keyup.enter="loadOrder" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadOrder">载入单据</el-button>
        </el-form-item>
        <el-form-item label="当前外箱">
          <el-tag v-if="state.outerBoxCode" type="warning">{{ state.outerBoxCode }}</el-tag>
          <span v-else class="color-999">请先扫描外箱码</span>
        </el-form-item>
      </el-form>
      <el-form :inline="true" class="mt-2">
        <el-form-item label="外箱码">
          <el-input ref="outerBoxCodeRef" v-model="state.outerBoxCodeInput" style="width: 250px" placeholder="扫描外箱码，空码回车自动生成" @keyup.enter="scanOuter" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="scanOuter">开箱</el-button>
        </el-form-item>
        <el-form-item label="内箱码">
          <el-input ref="innerBoxCodeRef" v-model="state.innerBoxCode" style="width: 240px" placeholder="扫描内箱码" @keyup.enter="scanInner" />
        </el-form-item>
        <el-form-item label="数量">
          <el-input-number v-model="state.qty" :min="0" :precision="5" controls-position="right" style="width: 120px" />
        </el-form-item>
        <el-form-item>
          <el-button type="success" @click="scanInner">装入当前外箱</el-button>
          <el-button type="warning" :disabled="!state.outerBoxId" @click="closeBox">封箱</el-button>
          <el-button type="primary" :disabled="!state.outerBoxId" @click="verify">发货核验</el-button>
          <el-button type="info" :disabled="state.selectedBoxLevel !== 'OUTER'" @click="printBox('OUTER')">打印外箱装箱单</el-button>
          <el-button type="info" :disabled="state.selectedBoxLevel !== 'INNER'" @click="printBox('INNER')">打印内箱清单</el-button>
          <el-button type="danger" :loading="state.submitting" @click="submit">提交出库</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="mt-4">
      <template #header>
        <div class="clearfix">
          <span>出库明细（双击选择当前商品）</span>
        </div>
      </template>
      <el-table :data="state.detailList" border stripe size="small" height="220" highlight-current-row @row-dblclick="selectDetail">
        <el-table-column prop="productCode" label="商品编号" width="130" />
        <el-table-column prop="productName" label="商品名称" min-width="160" />
        <el-table-column prop="productModel" label="条码" width="150" />
        <el-table-column prop="productSpec" label="规格" width="100" />
        <el-table-column prop="quantityOrder" label="订单数量" width="100" />
        <el-table-column prop="quantityOuted" label="已出数量" width="100" />
        <el-table-column label="当前" width="70">
          <template #default="{ row }">
            <el-tag v-if="state.currentDetail?.orderDetailId === row.orderDetailId" type="success">已选</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never" class="mt-4">
      <template #header>
        <div class="clearfix">
          <span>装箱箱树（外箱 → 内箱）</span>
          <el-button link type="primary" @click="loadTree">刷新箱树</el-button>
        </div>
      </template>
      <el-table :data="state.tree" row-key="boxId" :tree-props="{ children: 'children' }" default-expand-all border stripe size="small" height="360" highlight-current-row @row-click="selectBox">
        <el-table-column prop="boxCode" label="箱码" min-width="210" />
        <el-table-column prop="boxLevel" label="层级" width="80">
          <template #default="{ row }">
            <el-tag :type="row.boxLevel === 'OUTER' ? 'warning' : 'info'">{{ row.boxLevel === 'OUTER' ? '外箱' : '内箱' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="productCode" label="商品编号" width="120" />
        <el-table-column prop="productName" label="商品名称" min-width="140" />
        <el-table-column prop="packedQty" label="已装数量" width="100" />
        <el-table-column prop="status" label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="row.status === 'VERIFIED' || row.status === 'SHIPPED' ? 'success' : row.status === 'PACKED' ? 'warning' : 'info'">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="内箱进度" width="110">
          <template #default="{ row }">
            <span v-if="row.boxLevel === 'OUTER'">{{ row.innerPacked || 0 }} / {{ row.innerTotal || 0 }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts" name="outbound-scan-box-pack">
import { ComponentInternalInstance, nextTick } from 'vue';
import { BaseProperties } from '/@/types/base-type';
import { postData } from '/@/api/common/baseApi';
import to from 'await-to-js';

const ins = getCurrentInstance() as ComponentInternalInstance;
const proxy = ins.proxy as BaseProperties;
const orderCodeRef = ref();
const outerBoxCodeRef = ref();
const innerBoxCodeRef = ref();

const state = reactive({
  orderCode: '',
  detailList: [] as any[],
  tree: [] as any[],
  currentDetail: null as any,
  outerBoxCodeInput: '',
  outerBoxCode: '',
  outerBoxId: undefined as number | undefined,
  innerBoxCode: '',
  qty: 0,
  selectedBoxId: undefined as number | undefined,
  selectedBoxLevel: '',
  printTemplates: [] as any[],
  submitting: false,
});

const loadOrder = async () => {
  if (!state.orderCode.trim()) {
    proxy.$message.error('请先输入出库单号');
    return;
  }
  const [err, res] = await to(postData('/outbound/out/outScanOrder/getOutOrderData', { orderCode: state.orderCode.trim() }));
  if (err) return;
  if (!res.result) {
    proxy.$message.error(res.msg);
    return;
  }
  state.detailList = res.data.detailList || [];
  state.outerBoxId = undefined;
  state.outerBoxCode = '';
  await loadTree();
  nextTick(() => outerBoxCodeRef.value?.focus());
};

const loadTree = async () => {
  if (!state.orderCode) return;
  const [err, res] = await to(postData('/outbound/out/outBoxPack/getTree', { orderCode: state.orderCode }));
  if (err) return;
  if (res.result) {
    state.tree = (res.data || []).map((node: any) => ({ ...node, children: node.innerBoxList || [] }));
  }
};

const selectDetail = (row: any) => {
  state.currentDetail = row;
  if (!state.qty) state.qty = 1;
  proxy.$message.success(`已选择商品：${row.productName}`);
};

const selectBox = (row: any) => {
  state.selectedBoxId = row.boxId;
  state.selectedBoxLevel = row.boxLevel;
};

const scanOuter = async () => {
  if (!state.orderCode) {
    proxy.$message.error('请先载入出库单');
    return;
  }
  const [err, res] = await to(postData('/outbound/out/outBoxPack/scanOuter', {
    orderCode: state.orderCode,
    boxCode: state.outerBoxCodeInput.trim(),
  }));
  if (err) return;
  if (res.result) {
    state.outerBoxId = res.data.boxId;
    state.outerBoxCode = res.data.boxCode;
    state.outerBoxCodeInput = '';
    await loadTree();
    nextTick(() => innerBoxCodeRef.value?.focus());
  } else {
    proxy.$message.error(res.msg);
  }
};

const scanInner = async () => {
  if (!state.outerBoxId || !state.currentDetail) {
    proxy.$message.error('请先选择外箱，并双击选择出库明细');
    return;
  }
  const [err, res] = await to(postData('/outbound/out/outBoxPack/scanInner', {
    orderCode: state.orderCode,
    outerBoxId: state.outerBoxId,
    boxCode: state.innerBoxCode.trim(),
    productModel: state.currentDetail.productModel,
    orderDetailId: state.currentDetail.orderDetailId,
    qty: state.qty,
  }));
  if (err) return;
  if (res.result) {
    state.innerBoxCode = '';
    await loadTree();
    nextTick(() => innerBoxCodeRef.value?.focus());
  } else {
    proxy.$message.error(res.msg);
  }
};

const closeBox = async () => {
  const [err, res] = await to(postData('/outbound/out/outBoxPack/closeBox', { boxId: state.outerBoxId }));
  if (err) return;
  if (res.result) {
    proxy.$message.success('封箱成功');
    state.outerBoxId = undefined;
    state.outerBoxCode = '';
    await loadTree();
  } else {
    proxy.$message.error(res.msg);
  }
};

const verify = async () => {
  const [err, res] = await to(postData('/outbound/out/outBoxPack/verify', { boxId: state.outerBoxId }));
  if (err) return;
  if (res.result) {
    proxy.$message.success('核验成功');
    await loadTree();
  } else {
    proxy.$message.error(res.msg);
  }
};

const submit = async () => {
  state.submitting = true;
  const [err, res] = await to(postData('/outbound/out/outBoxPack/submit', { orderCode: state.orderCode }));
  state.submitting = false;
  if (err) return;
  if (res.result) {
    proxy.$message.success('内外箱装箱出库成功');
    state.outerBoxId = undefined;
    state.outerBoxCode = '';
    await loadTree();
  } else {
    proxy.$message.error(res.msg);
  }
};

const printBox = async (level: string) => {
  if (!state.selectedBoxId) return;
  if (!state.printTemplates.length) {
    const [err, res] = await to(postData('/system/core/printTemplate/getTemplateListByMenuId', { menuId: 2336 }));
    if (err) return;
    state.printTemplates = res.data || [];
  }
  const router = level === 'OUTER' ? '/outbound/out/outBoxPack/printOuter' : '/outbound/out/outBoxPack/printInner';
  const template = state.printTemplates.find((item: any) => {
    try {
      return JSON.parse(item.vueData).dataOptions.router === router;
    } catch {
      return false;
    }
  });
  if (!template) {
    proxy.$message.error(`未找到打印模板：${router}`);
    return;
  }
  const key = proxy.common.getGUID();
  window.open(`/system/print/base-template-id/2336/${template.printTemplateId}/${state.selectedBoxId}?key=${key}&autoPrint=false&isAutoLoad=true`);
};

onMounted(() => nextTick(() => orderCodeRef.value?.focus()));
</script>
