<template>
  <div class="biz-container box-level-scan-page">
    <el-card shadow="never">
      <el-form :inline="true">
        <el-form-item label="预到货单号">
          <el-input ref="orderCodeRef" v-model="state.orderCode" style="width: 220px" @keyup.enter="loadOrder" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadOrder">载入单据</el-button>
        </el-form-item>
        <el-form-item label="收货/上架货位">
          <el-input v-model="state.positionName" style="width: 180px" placeholder="货位名称" />
        </el-form-item>
        <el-form-item label="直接上架">
          <el-switch v-model="state.isOnShelve" />
        </el-form-item>
        <el-form-item label="生产日期">
          <el-date-picker v-model="state.produceDate" type="date" value-format="YYYY-MM-DD" placeholder="选择生产日期" style="width: 160px" />
        </el-form-item>
        <el-form-item label="批次号">
          <el-input v-model="state.batchNumber" style="width: 160px" placeholder="可选" />
        </el-form-item>
      </el-form>
      <el-form :inline="true" class="mt-2">
        <el-form-item label="箱码">
          <el-input ref="boxCodeRef" v-model="state.boxCode" style="width: 280px" placeholder="扫描外箱码或内箱码" @keyup.enter="scan" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="scan">扫描</el-button>
          <el-button type="success" :disabled="!state.selectedBoxId" @click="closeBox">封箱</el-button>
          <el-button type="warning" :disabled="!state.selectedBoxId" @click="cancelBox">撤销本箱</el-button>
          <el-button type="info" :disabled="state.selectedBoxLevel !== 'OUTER'" @click="printBox('OUTER')">打印外箱标签</el-button>
          <el-button type="info" :disabled="state.selectedBoxLevel !== 'INNER'" @click="printBox('INNER')">打印内箱标签</el-button>
          <el-button type="danger" :loading="state.submitting" @click="submit">提交入库</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="mt-4">
      <template #header>
        <div class="clearfix">
          <span>预到货明细（双击选择当前商品，拆箱扫内箱时使用）</span>
        </div>
      </template>
      <el-table :data="state.orderList" border stripe size="small" height="220" highlight-current-row @row-dblclick="selectDetail">
        <el-table-column prop="productCode" label="商品编号" width="130" />
        <el-table-column prop="productName" label="商品名称" min-width="160" />
        <el-table-column prop="productModel" label="条码" width="150" />
        <el-table-column prop="productSpec" label="规格" width="100" />
        <el-table-column prop="quantity" label="预到货数量" width="100" />
        <el-table-column prop="enterQuantity" label="已收数量" width="100" />
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
          <span>箱树（外箱 → 内箱）</span>
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
        <el-table-column prop="innerQty" label="每内箱装数" width="110" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'RECEIVED' || row.status === 'SHELVED' ? 'success' : row.status === 'PARTIAL' ? 'warning' : 'info'">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="内箱进度" width="110">
          <template #default="{ row }">
            <span v-if="row.boxLevel === 'OUTER'">{{ row.innerReceived || 0 }} / {{ row.innerTotal || 0 }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="scannedQty" label="已收数量" width="100" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts" name="inbound-scan-box-level">
import { ComponentInternalInstance, nextTick } from 'vue';
import { BaseProperties } from '/@/types/base-type';
import { postData } from '/@/api/common/baseApi';
import to from 'await-to-js';

const ins = getCurrentInstance() as ComponentInternalInstance;
const proxy = ins.proxy as BaseProperties;
const orderCodeRef = ref();
const boxCodeRef = ref();

const state = reactive({
  orderCode: '',
  orderId: undefined as number | undefined,
  positionName: '',
  isOnShelve: false,
  produceDate: '',
  batchNumber: '',
  boxCode: '',
  orderList: [] as any[],
  tree: [] as any[],
  currentDetail: null as any,
  selectedBoxId: undefined as number | undefined,
  selectedBoxLevel: '',
  printTemplates: [] as any[],
  submitting: false,
});

const loadOrder = async () => {
  if (!state.orderCode.trim()) {
    proxy.$message.error('请先输入预到货单号');
    return;
  }
  const [err, res] = await to(postData('/inbound/in/inScanOrder/getInOrderData', { orderCode: state.orderCode.trim(), isOnShelve: state.isOnShelve }));
  if (err) return;
  if (!res.result) {
    proxy.$message.error(res.msg);
    return;
  }
  state.orderId = res.data.orderId;
  state.orderList = res.data.orderList || [];
  await loadTree();
  nextTick(() => boxCodeRef.value?.focus());
};

const loadTree = async () => {
  if (!state.orderCode) return;
  const [err, res] = await to(postData('/inbound/in/inBoxScan/getTree', { orderCode: state.orderCode }));
  if (err) return;
  if (res.result) {
    state.tree = (res.data || []).map((node: any) => ({ ...node, children: node.innerBoxList || [] }));
  }
};

const selectDetail = (row: any) => {
  state.currentDetail = row;
  proxy.$message.success(`已选择商品：${row.productName}`);
};

const selectBox = (row: any) => {
  state.selectedBoxId = row.boxId;
  state.selectedBoxLevel = row.boxLevel;
};

const scan = async () => {
  if (!state.orderCode || !state.boxCode.trim()) {
    proxy.$message.error('请先载入单据并扫描箱码');
    return;
  }
  const [err, res] = await to(postData('/inbound/in/inBoxScan/scan', {
    orderCode: state.orderCode,
    boxCode: state.boxCode.trim(),
    orderDetailId: state.currentDetail?.orderDetailId,
  }));
  if (err) return;
  if (res.result) {
    state.boxCode = '';
    await loadTree();
    nextTick(() => boxCodeRef.value?.focus());
  } else {
    proxy.$message.error(res.msg);
  }
};

const closeBox = async () => {
  const [err, res] = await to(postData('/inbound/in/inBoxScan/close', { boxId: state.selectedBoxId }));
  if (err) return;
  if (res.result) {
    proxy.$message.success('封箱成功');
    await loadTree();
  } else {
    proxy.$message.error(res.msg);
  }
};

const cancelBox = async () => {
  const [err, res] = await to(postData('/inbound/in/inBoxScan/cancel', { boxId: state.selectedBoxId }));
  if (err) return;
  if (res.result) {
    proxy.$message.success('已撤销');
    state.selectedBoxId = undefined;
    await loadTree();
  } else {
    proxy.$message.error(res.msg);
  }
};

const submit = async () => {
  if (!state.positionName.trim()) {
    proxy.$message.error('请填写收货/上架货位');
    return;
  }
  state.submitting = true;
  const [err, res] = await to(postData('/inbound/in/inBoxScan/submit', {
    orderCode: state.orderCode,
    positionName: state.positionName.trim(),
    isOnShelve: state.isOnShelve,
    produceDate: state.produceDate,
    batchNumber: state.batchNumber.trim(),
  }));
  state.submitting = false;
  if (err) return;
  if (res.result) {
    proxy.$message.success('内外箱入库成功');
    state.tree = [];
    state.selectedBoxId = undefined;
    await loadOrder();
  } else {
    proxy.$message.error(res.msg);
  }
};

const printBox = async (level: string) => {
  if (!state.selectedBoxId) return;
  if (!state.printTemplates.length) {
    const [err, res] = await to(postData('/system/core/printTemplate/getTemplateListByMenuId', { menuId: 2335 }));
    if (err) return;
    state.printTemplates = res.data || [];
  }
  const router = level === 'OUTER' ? '/inbound/in/inBoxScan/printOuter' : '/inbound/in/inBoxScan/printInner';
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
  window.open(`/system/print/base-template-id/2335/${template.printTemplateId}/${state.selectedBoxId}?key=${key}&autoPrint=false&isAutoLoad=true`);
};

onMounted(() => nextTick(() => orderCodeRef.value?.focus()));
</script>
