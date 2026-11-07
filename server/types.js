/**
 * 物料类型定义：后端校验、前端动态表单、MCP 工具说明共用。
 * fields 中除 secret: true 的字段在列表接口中会被掩码。
 */

export const MATERIAL_TYPES = {
  server: {
    label: '服务器',
    group: '计算',
    color: '#22d3ee',
    mounted: true,
    fields: [
      { key: 'cpu', label: 'CPU', placeholder: '2 × Xeon Gold 6338' },
      { key: 'cpu_count', label: 'CPU 数量', type: 'number' },
      { key: 'memory_total', label: '内存总量', placeholder: '512 GB' },
      { key: 'disk', label: '磁盘', placeholder: '2 × 960GB SSD' },
      { key: 'power', label: '电源', placeholder: '2 × 800W 冗余' },
      { key: 'bmc_ip', label: 'BMC IP', placeholder: '10.30.1.11', group: '带外管理' },
      { key: 'bmc_protocol', label: 'BMC 协议', type: 'select', options: ['IPMI', 'Redfish', 'iDRAC', 'iLO'], group: '带外管理' },
      { key: 'bmc_user', label: 'BMC 账号', placeholder: 'admin', group: '带外管理' },
      { key: 'bmc_password', label: 'BMC 密码', type: 'password', secret: true, group: '带外管理' },
      { key: 'os_ip', label: 'OS 管理 IP', placeholder: '10.20.1.11', group: '操作系统' },
      { key: 'os_user', label: 'OS 账号', placeholder: 'root', group: '操作系统' },
      { key: 'os_password', label: 'OS 密码', type: 'password', secret: true, group: '操作系统' },
      { key: 'os_type', label: '操作系统', placeholder: 'Ubuntu 22.04 LTS', group: '操作系统' },
      { key: 'os_hostname', label: '主机名', placeholder: 'node-a01-01', group: '操作系统' },
    ],
  },
  switch: {
    label: '交换机',
    group: '网络',
    color: '#a78bfa',
    mounted: true,
    fields: [
      { key: 'ports', label: '端口数', placeholder: '48 × 25G + 8 × 100G' },
      { key: 'mgmt_ip', label: '管理 IP', placeholder: '10.40.1.2', group: '管理' },
      { key: 'mgmt_user', label: '管理账号', placeholder: 'admin', group: '管理' },
      { key: 'mgmt_password', label: '管理密码', type: 'password', secret: true, group: '管理' },
      { key: 'protocol', label: '管理协议', type: 'select', options: ['SSH', 'SNMP', 'Web', 'NETCONF'], group: '管理' },
      { key: 'uplink', label: '上联', placeholder: 'Core-SW-01 / 100G' },
      { key: 'firmware', label: '固件版本', placeholder: 'V200R019C10' },
    ],
  },
  nic: {
    label: '网卡',
    group: '计算部件',
    color: '#34d399',
    mounted: false,
    fields: [
      { key: 'interface', label: '接口类型', placeholder: 'PCIe 4.0 x16' },
      { key: 'speed', label: '速率', placeholder: '25GbE' },
      { key: 'mac', label: 'MAC 地址', placeholder: 'B8:59:9F:xx:xx:xx' },
      { key: 'pcie_slot', label: 'PCIe 槽位', placeholder: 'Slot 3' },
      { key: 'firmware', label: '固件版本' },
    ],
  },
  dpu: {
    label: 'DPU',
    group: '计算部件',
    color: '#2dd4bf',
    mounted: false,
    fields: [
      { key: 'mode', label: '工作模式', type: 'select', options: ['DPU', 'IPU', 'SmartNIC'] },
      { key: 'mgmt_ip', label: '管理 IP', placeholder: '10.50.1.21', group: '管理' },
      { key: 'mgmt_user', label: '管理账号', placeholder: 'admin', group: '管理' },
      { key: 'mgmt_password', label: '管理密码', type: 'password', secret: true, group: '管理' },
      { key: 'pcie_slot', label: 'PCIe 槽位', placeholder: 'Slot 5' },
      { key: 'firmware', label: '固件版本', placeholder: 'DOCA 2.6' },
    ],
  },
  memory: {
    label: '内存',
    group: '计算部件',
    color: '#fbbf24',
    mounted: false,
    fields: [
      { key: 'capacity_gb', label: '容量 (GB)', type: 'number', placeholder: '64' },
      { key: 'mem_type', label: '类型', type: 'select', options: ['DDR4', 'DDR5', 'LPDDR5', 'HBM3'] },
      { key: 'speed_mhz', label: '频率 (MHz)', type: 'number', placeholder: '3200' },
      { key: 'slot_index', label: 'DIMM 槽位', placeholder: 'DIMM A1' },
      { key: 'rank', label: 'Rank', placeholder: '2Rx4' },
    ],
  },
  disk: {
    label: '硬盘',
    group: '计算部件',
    color: '#fb923c',
    mounted: false,
    fields: [
      { key: 'capacity_gb', label: '容量 (GB)', type: 'number', placeholder: '960' },
      { key: 'disk_type', label: '类型', type: 'select', options: ['SSD', 'NVMe', 'HDD', 'SAS SSD'] },
      { key: 'interface', label: '接口', placeholder: 'NVMe PCIe 4.0' },
      { key: 'slot_index', label: '盘位', placeholder: 'Bay 1' },
    ],
  },
  cable: {
    label: '线缆',
    group: '布线',
    color: '#38bdf8',
    mounted: false,
    fields: [
      { key: 'cable_type', label: '线缆类型', type: 'select', options: ['DAC', 'AOC', '光纤', 'Cat6A', '电源线'] },
      { key: 'length_m', label: '长度 (m)', type: 'number', placeholder: '3' },
      { key: 'from_device', label: 'A 端设备', placeholder: 'SRV-B02-01' },
      { key: 'from_port', label: 'A 端端口', placeholder: 'eth0' },
      { key: 'to_device', label: 'B 端设备', placeholder: 'SW-B02' },
      { key: 'to_port', label: 'B 端端口', placeholder: 'GE1/0/1' },
    ],
  },
  sfp: {
    label: '光模块',
    group: '布线',
    color: '#60a5fa',
    mounted: false,
    fields: [
      { key: 'form_factor', label: '封装', type: 'select', options: ['SFP+', 'SFP28', 'QSFP28', 'QSFP-DD', 'OSFP'] },
      { key: 'speed', label: '速率', placeholder: '25G' },
      { key: 'wavelength', label: '波长', placeholder: '1310nm' },
      { key: 'connector', label: '接口', type: 'select', options: ['LC', 'MPO', 'RJ45'] },
    ],
  },
  pdu: {
    label: 'PDU',
    group: '供电',
    color: '#f472b6',
    mounted: true,
    fields: [
      { key: 'input', label: '输入', placeholder: '三相 32A' },
      { key: 'outlets', label: '输出口', placeholder: '24 × C13 + 6 × C19' },
      { key: 'max_power', label: '额定功率', placeholder: '11 kW' },
      { key: 'mgmt_ip', label: '管理 IP', group: '管理' },
      { key: 'mgmt_user', label: '管理账号', group: '管理' },
      { key: 'mgmt_password', label: '管理密码', type: 'password', secret: true, group: '管理' },
    ],
  },
  other: {
    label: '其他',
    group: '其他',
    color: '#94a3b8',
    mounted: true,
    fields: [],
  },
};

export const MATERIAL_STATUSES = {
  in_use: { label: '在用', color: '#34d399' },
  spare: { label: '库存', color: '#38bdf8' },
  maintenance: { label: '维护中', color: '#fbbf24' },
  fault: { label: '故障', color: '#f87171' },
  retired: { label: '已报废', color: '#64748b' },
};

export const COMMANDS = {
  ping: { label: '连通性检测', icon: 'Wifi', danger: false, description: '检测 BMC / OS 管理面连通性' },
  locate: { label: '定位闪烁', icon: 'MapPin', danger: false, description: '点亮服务器定位灯，便于现场查找' },
  selftest: { label: '硬件自检', icon: 'ShieldCheck', danger: false, description: '触发一次 BMC 硬件自检' },
  restart: { label: '重启服务器', icon: 'RotateCw', danger: true, description: '通过 BMC 下发重启指令' },
  power_off: { label: '关机', icon: 'Power', danger: true, description: '通过 BMC 执行优雅关机' },
  power_on: { label: '开机', icon: 'Power', danger: false, description: '通过 BMC 执行开机' },
};

export const HEALTH_META = {
  ok: { label: '健康', color: '#34d399' },
  warning: { label: '告警', color: '#fbbf24' },
  critical: { label: '严重', color: '#f87171' },
  offline: { label: '离线', color: '#64748b' },
  unknown: { label: '未知', color: '#94a3b8' },
};

export const SECRET_KEYS = Object.fromEntries(
  Object.entries(MATERIAL_TYPES).map(([type, def]) => [
    type,
    new Set(def.fields.filter((f) => f.secret).map((f) => f.key)),
  ]),
);

export const TYPE_KEYS = Object.keys(MATERIAL_TYPES);

export function typeLabel(type) {
  return MATERIAL_TYPES[type]?.label || type;
}

export function maskSpec(type, spec, reveal = false) {
  if (!spec || typeof spec !== 'object') return spec;
  if (reveal) return spec;
  const secrets = SECRET_KEYS[type];
  if (!secrets || secrets.size === 0) return spec;
  const out = { ...spec };
  for (const key of secrets) {
    if (out[key]) out[key] = '••••••';
  }
  return out;
}

/** 供 MCP / 前端表单展示的字段说明 */
export function materialTypeCatalog() {
  return TYPE_KEYS.map((key) => ({
    key,
    ...MATERIAL_TYPES[key],
    fields: MATERIAL_TYPES[key].fields.map((f) => ({ ...f })),
  }));
}