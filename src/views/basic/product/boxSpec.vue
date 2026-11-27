<template>
  <div class="biz-container box-spec-page">
    <el-card shadow="never">
      <el-form :inline="true">
        <el-form-item label="商品">
          <el-select v-model="state.filterProductId" filterable remote clearable :remote-method="remoteProduct" placeholder="输入商品编号或条码" style="width: 280px">
            <el-option v-for="item in state.productOptions" :key="item.productId" :label="`${item.productCode} ${item.productName} ${item.productModel || ''}`" :value="item.productId" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadData">查询</el-button>
          <el-button type="success" @click="openAdd">新增箱规</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="mt-4">
      <el-table :data="state.list" border stripe size="small">
        <el-table-column prop="productId" label="商品ID" width="90" />
        <el-table-column prop="specName" label="规格名称" min-width="160" />
        <el-table-column prop="innerQty" label="每内箱装数" width="110" />
        <el-table-column prop="outerInnerCount" label="每外箱内箱数" width="120" />
        <el-table-column prop="boxCodeMode" label="箱码模式" width="110">
          <template #default="{ row }">
            <el-tag :type="row.boxCodeMode === 'NONE' ? 'info' : row.boxCodeMode === 'SKU' ? 'warning' : 'success'">{{ row.boxCodeMode }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="boxBarcodeRule" label="自印码规则" min-width="120" />
        <el-table-column prop="isDefault" label="默认" width="70">
          <template #default="{ row }">{{ row.isDefault === 1 ? '是' : '否' }}</template>
        </el-table-column>
        <el-table-column prop="enable" label="启用" width="70">
          <template #default="{ row }">{{ row.enable === 1 ? '是' : '否' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="removeRow(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="state.dialogVisible" :title="state.form.specId ? '编辑箱规' : '新增箱规'" width="520px" append-to-body>
      <el-form :model="state.form" label-width="130px">
        <el-form-item label="商品" required>
          <el-select v-model="state.form.productId" filterable remote :remote-method="remoteProduct" placeholder="输入商品编号或条码" style="width: 100%">
            <el-option v-for="item in state.productOptions" :key="item.productId" :label="`${item.productCode} ${item.productName} ${item.productModel || ''}`" :value="item.productId" />
          </el-select>
        </el-form-item>
        <el-form-item label="规格名称" required>
          <el-input v-model="state.form.specName" placeholder="如：4瓶×2内箱/外箱" />
        </el-form-item>
        <el-form-item label="每内箱装数" required>
          <el-input-number v-model="state.form.innerQty" :min="0.00001" :precision="5" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="每外箱内箱数" required>
          <el-input-number v-model="state.form.outerInnerCount" :min="1" :max="999" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="箱码模式" required>
          <el-select v-model="state.form.boxCodeMode" style="width: 100%">
            <el-option label="NONE - 不参与箱管理" value="NONE" />
            <el-option label="SKU - 固定箱码，不建实例" value="SKU" />
            <el-option label="INSTANCE - 必须扫唯一箱码" value="INSTANCE" />
            <el-option label="BOTH - 固定码与唯一码并存" value="BOTH" />
          </el-select>
        </el-form-item>
        <el-form-item label="自印码规则">
          <el-input v-model="state.form.boxBarcodeRule" placeholder="可选，如 IN- / OUT-" />
        </el-form-item>
        <el-form-item label="默认箱规">
          <el-switch v-model="state.form.isDefault" :active-value="1" :inactive-value="0" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="state.form.enable" :active-value="1" :inactive-value="0" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="state.form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="state.dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="state.saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts" name="basic-product-box-spec">
import { ComponentInternalInstance } from 'vue';
import { BaseProperties } from '/@/types/base-type';
import { DataType, QueryType } from '/@/types/common';
import { postData, deleteData } from '/@/api/common/baseApi';
import to from 'await-to-js';

const ins = getCurrentInstance() as ComponentInternalInstance;
const proxy = ins.proxy as BaseProperties;

const state = reactive({
  filterProductId: undefined as number | undefined,
  productOptions: [] as any[],
  list: [] as any[],
  dialogVisible: false,
  saving: false,
  form: {
    specId: undefined as number | undefined,
    productId: undefined as number | undefined,
    specName: '',
    innerQty: 1,
    outerInnerCount: 1,
    boxCodeMode: 'BOTH',
    boxBarcodeRule: '',
    isDefault: 1,
    enable: 1,
    remark: '',
  },
});

const remoteProduct = async (query: string) => {
  if (!query) {
    state.productOptions = [];
    return;
  }
  const params = {
    pageIndex: 1,
    pageSize: 30,
    prefixRouter: '/basic/product/product',
    tableName: 'base_product',
    queryBoList: [
      { column: 'productCode', values: query, queryType: QueryType.LIKE, dataType: DataType.STRING },
      { column: 'productModel', values: query, queryType: QueryType.LIKE, dataType: DataType.STRING, connector: 'OR' },
    ],
  };
  const [err, res] = await to(postData('/basic/product/product/pageList', params));
  if (!err && res.result) {
    state.productOptions = res.rows || [];
  }
};

const loadData = async () => {
  const queryBoList: any[] = [];
  if (state.filterProductId) {
    queryBoList.push({ column: 'productId', values: state.filterProductId, queryType: QueryType.EQ, dataType: DataType.LONG });
  }
  const params = {
    pageIndex: 1,
    pageSize: 100,
    prefixRouter: '/basic/product/boxSpec',
    tableName: 'base_box_spec',
    queryBoList,
  };
  const [err, res] = await to(postData('/basic/product/boxSpec/pageList', params));
  if (err) return;
  if (res.result) {
    state.list = res.rows || [];
  } else {
    proxy.$message.error(res.msg);
  }
};

const openAdd = () => {
  state.form = {
    specId: undefined,
    productId: state.filterProductId,
    specName: '',
    innerQty: 1,
    outerInnerCount: 1,
    boxCodeMode: 'BOTH',
    boxBarcodeRule: '',
    isDefault: 1,
    enable: 1,
    remark: '',
  };
  state.dialogVisible = true;
};

const openEdit = (row: any) => {
  state.form = { ...row };
  state.dialogVisible = true;
};

const save = async () => {
  if (!state.form.productId || !state.form.specName || !state.form.innerQty || !state.form.outerInnerCount) {
    proxy.$message.error('请完整填写商品、规格名称和箱数');
    return;
  }
  state.saving = true;
  const url = state.form.specId ? '/basic/product/boxSpec/update' : '/basic/product/boxSpec/insert';
  const [err, res] = await to(postData(url, state.form));
  state.saving = false;
  if (err) return;
  if (res.result) {
    proxy.$message.success('保存成功');
    state.dialogVisible = false;
    loadData();
  } else {
    proxy.$message.error(res.msg);
  }
};

const removeRow = async (row: any) => {
  const [err, res] = await to(deleteData(`/basic/product/boxSpec/remove/${row.specId}`));
  if (err) return;
  if (res.result) {
    proxy.$message.success('删除成功');
    loadData();
  } else {
    proxy.$message.error(res.msg);
  }
};

onMounted(loadData);
</script>
