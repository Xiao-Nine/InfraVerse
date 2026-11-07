import { hashPassword } from './crypto.js';
import { COMMANDS, HEALTH_META, MATERIAL_STATUSES, MATERIAL_TYPES } from './types.js';

/**
 * 首次启动时写入演示数据：B02-B06 五个机柜、21 台上架服务器、网络/供电设备、部件与库存物料。
 * 所有账号均为管理员，演示账号：admin / admin123（请登录后修改密码）。
 */
export function seedDatabase({ run, get, tx, now }) {
  const ts = now();
  const userId = (() => {
    const existing = get('SELECT id FROM users ORDER BY id LIMIT 1');
    if (existing) return existing.id;
    return run(
      'INSERT INTO users (username, password_hash, display_name, created_at) VALUES (?, ?, ?, ?)',
      'admin',
      hashPassword('admin123'),
      '系统管理员',
      ts,
    ).lastInsertRowid;
  })();

  const racks = [];
  // B02-B06 五个机柜排成一行，面向 +Z；3D 视角从前方 3/4 角度观察。
  const rackNames = ['B02', 'B03', 'B04', 'B05', 'B06'];
  const rackX = [-1.8, -0.9, 0, 0.9, 1.8];
  rackNames.forEach((name, index) => {
    const id = run(
      `INSERT INTO racks (name, row_label, col, x, z, rotation, u_height, power_capacity, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      name,
      'B',
      index + 2,
      rackX[index],
      0,
      0,
      42,
      '2 × 32A 三相',
      index >= 3 ? 'B 区 · 计算与网络区' : 'B 区 · 计算节点',
      ts,
      ts,
    ).lastInsertRowid;
    racks.push({ id, name, row: 'B', col: index + 2 });
  });
  const rackByName = Object.fromEntries(racks.map((r) => [r.name, r]));

  const models = [
    { model: 'Dell PowerEdge R750', vendor: 'Dell', cpu: '2 × Xeon Gold 6338', mem: '512 GB', disk: '2 × 960GB SSD' },
    { model: 'HPE ProLiant DL380 Gen10', vendor: 'HPE', cpu: '2 × Xeon Silver 4314', mem: '384 GB', disk: '4 × 1.2TB SAS' },
    { model: 'Lenovo ThinkSystem SR650 V2', vendor: 'Lenovo', cpu: '2 × Xeon Gold 5318Y', mem: '512 GB', disk: '2 × 1.92TB NVMe' },
    { model: 'Inspur NF5280M6', vendor: 'Inspur', cpu: '2 × Xeon Gold 6330', mem: '768 GB', disk: '4 × 960GB SSD' },
    { model: 'Huawei FusionServer 2288H V6', vendor: 'Huawei', cpu: '2 × Xeon Gold 6348', mem: '1 TB', disk: '2 × 3.84TB NVMe' },
  ];

  const placements = [
    ['B02', 2, 2], ['B02', 5, 1], ['B02', 8, 2], ['B02', 12, 1], ['B02', 15, 2],
    ['B03', 2, 2], ['B03', 5, 1], ['B03', 8, 2], ['B03', 11, 1],
    ['B04', 2, 2], ['B04', 5, 1], ['B04', 8, 2], ['B04', 12, 1],
    ['B05', 2, 2], ['B05', 6, 1], ['B05', 9, 2], ['B05', 13, 1],
    ['B06', 2, 2], ['B06', 5, 1], ['B06', 8, 2], ['B06', 11, 1],
  ];

  const serverRows = [];
  placements.forEach(([rackName, u, h], index) => {
    const rack = rackByName[rackName];
    const seq = placements.slice(0, index).filter(([r]) => r === rackName).length + 1;
    const m = models[index % models.length];
    const code = `SRV-${rackName}-${String(seq).padStart(2, '0')}`;
    const hostname = `node-${rackName.toLowerCase()}-${String(seq).padStart(2, '0')}`;
    const bmcIp = `10.30.${rack.row === 'A' ? 1 : 2}.${10 + index}`;
    const osIp = `10.20.${rack.row === 'A' ? 1 : 2}.${10 + index}`;
    const powerState = index === 7 ? 'off' : 'on';
    let health = 'ok';
    let materialStatus = 'in_use';
    let cpu = 32 + ((index * 13) % 45);
    let mem = 41 + ((index * 7) % 38);
    let temp = 38 + ((index * 3) % 12);
    let lastSeenMinutes = (index * 3) % 10;

    if (index === 7) {
      health = 'offline';
      materialStatus = 'maintenance';
      cpu = 0;
      mem = 0;
      temp = 26;
      lastSeenMinutes = 24 * 60;
    } else if (index === 9) {
      health = 'critical';
      materialStatus = 'fault';
      cpu = 96;
      mem = 91;
      temp = 81;
      lastSeenMinutes = 2;
    } else if (index === 16) {
      health = 'warning';
      cpu = 88;
      mem = 79;
      temp = 74;
      lastSeenMinutes = 1;
    }

    const spec = {
      cpu: m.cpu,
      cpu_count: 2,
      memory_total: m.mem,
      disk: m.disk,
      power: '2 × 800W 冗余',
      bmc_ip: bmcIp,
      bmc_protocol: index % 3 === 0 ? 'Redfish' : 'IPMI',
      bmc_user: 'admin',
      bmc_password: `Bmc@${rackName}2024!`,
      os_ip: osIp,
      os_user: 'root',
      os_password: `Root@${rackName}2024!`,
      os_type: index % 2 === 0 ? 'Ubuntu 22.04 LTS' : 'Rocky Linux 9',
      os_hostname: hostname,
    };

    const materialId = run(
      `INSERT INTO materials
       (code, name, type, model, vendor, serial, status, rack_id, position_u, u_height, slot, parent_id, spec, note, created_by, created_at, updated_at)
       VALUES (?, ?, 'server', ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
      code,
      `计算节点 ${rackName}-${String(seq).padStart(2, '0')}`,
      m.model,
      m.vendor,
      `SN${rackName}${String(1000 + index)}`,
      materialStatus,
      rack.id,
      u,
      h,
      `U${u}-U${u + h - 1}`,
      JSON.stringify(spec),
      index % 5 === 0 ? '承载核心业务集群' : null,
      userId,
      ts,
      ts,
    ).lastInsertRowid;

    run(
      `INSERT INTO server_status
       (material_id, power_state, health, cpu_pct, mem_pct, temp_c, uptime_s, last_seen, metrics, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      materialId,
      powerState,
      health,
      cpu,
      mem,
      temp,
      powerState === 'on' ? 86400 * (3 + (index % 21)) + 3600 * (index % 12) : 0,
      new Date(Date.now() - lastSeenMinutes * 60_000).toISOString(),
      JSON.stringify({ load1: Math.round(cpu * 0.1) / 10, net_rx_mbps: 120 + index * 17, net_tx_mbps: 80 + index * 9 }),
      ts,
    );

    serverRows.push({ id: materialId, code, name: `计算节点 ${rackName}-${String(seq).padStart(2, '0')}`, rack, u, h, hostname, specs: { bmcIp, osIp } });
  });

  function insertMaterial(def) {
    return run(
      `INSERT INTO materials
       (code, name, type, model, vendor, serial, status, rack_id, position_u, u_height, slot, parent_id, spec, note, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      def.code,
      def.name,
      def.type,
      def.model || null,
      def.vendor || null,
      def.serial || null,
      def.status || 'in_use',
      def.rack_id || null,
      def.position_u ?? null,
      def.u_height || 1,
      def.slot || null,
      def.parent_id || null,
      JSON.stringify(def.spec || {}),
      def.note || null,
      userId,
      ts,
      ts,
    ).lastInsertRowid;
  }

  // 每柜一台 ToR 交换机 + 一台 PDU
  racks.forEach((rack, index) => {
    insertMaterial({
      code: `SW-${rack.name}`,
      name: `接入交换机 ${rack.name}`,
      type: 'switch',
      model: 'H3C S6850-56HF',
      vendor: 'H3C',
      serial: `SW${rack.name}2024`,
      rack_id: rack.id,
      position_u: 40,
      u_height: 1,
      slot: 'U40',
      spec: {
        ports: '48 × 25G + 8 × 100G',
        mgmt_ip: `10.40.${rack.row === 'A' ? 1 : 2}.${20 + index}`,
        mgmt_user: 'admin',
        mgmt_password: `Net@${rack.name}2024!`,
        protocol: 'SSH',
        uplink: 'SW-CORE-01 / 100G',
        firmware: 'V200R019C10',
      },
    });
    insertMaterial({
      code: `PDU-${rack.name}`,
      name: `机柜 PDU ${rack.name}`,
      type: 'pdu',
      model: 'APC AP8886',
      vendor: 'APC',
      rack_id: rack.id,
      position_u: 42,
      u_height: 1,
      slot: 'U42',
      spec: {
        input: '三相 32A',
        outlets: '24 × C13 + 6 × C19',
        max_power: '11 kW',
        mgmt_ip: `10.60.${rack.row === 'A' ? 1 : 2}.${20 + index}`,
        mgmt_user: 'admin',
        mgmt_password: `Pdu@${rack.name}2024!`,
      },
    });
  });

  // 两台核心交换机
  insertMaterial({
    code: 'SW-CORE-01',
    name: '核心交换机 01',
    type: 'switch',
    model: 'Cisco Nexus 9336C-FX2',
    vendor: 'Cisco',
    status: 'in_use',
    rack_id: rackByName.B06.id,
    position_u: 20,
    u_height: 2,
    slot: 'U20-U21',
    spec: { ports: '36 × 100G', mgmt_ip: '10.40.9.1', mgmt_user: 'admin', mgmt_password: 'Core@2024!', protocol: 'SSH', uplink: 'Spine / 400G', firmware: 'NXOS 10.2(4)' },
  });
  insertMaterial({
    code: 'SW-CORE-02',
    name: '核心交换机 02',
    type: 'switch',
    model: 'Cisco Nexus 9336C-FX2',
    vendor: 'Cisco',
    status: 'in_use',
    rack_id: rackByName.B06.id,
    position_u: 24,
    u_height: 2,
    slot: 'U24-U25',
    spec: { ports: '36 × 100G', mgmt_ip: '10.40.9.2', mgmt_user: 'admin', mgmt_password: 'Core@2024!', protocol: 'SSH', uplink: 'Spine / 400G', firmware: 'NXOS 10.2(4)' },
  });

  // 服务器内部物料
  serverRows.slice(0, 10).forEach((server, idx) => {
    const rackId = server.rack.id;
    insertMaterial({
      code: `NIC-${server.code.slice(4)}-1`,
      name: `25G 双口网卡 ${server.code}`,
      type: 'nic',
      model: 'Intel E810-XXVDA2',
      vendor: 'Intel',
      serial: `NIC${1000 + idx}`,
      status: 'in_use',
      rack_id: rackId,
      parent_id: server.id,
      slot: 'PCIe Slot 3',
      spec: { interface: 'PCIe 4.0 x8', speed: '25GbE', mac: `B8:59:9F:${(10 + idx).toString(16).padStart(2, '0')}:A1:${(20 + idx).toString(16).padStart(2, '0')}`, pcie_slot: 'Slot 3', firmware: '4.40' },
    });
    if (idx < 6) {
      insertMaterial({
        code: `DPU-${server.code.slice(4)}-1`,
        name: `DPU ${server.code}`,
        type: 'dpu',
        model: 'NVIDIA BlueField-2',
        vendor: 'NVIDIA',
        serial: `DPU${2000 + idx}`,
        status: 'in_use',
        rack_id: rackId,
        parent_id: server.id,
        slot: 'PCIe Slot 5',
        spec: { mode: 'DPU', mgmt_ip: `10.50.1.${30 + idx}`, mgmt_user: 'admin', mgmt_password: `Dpu@2024!${idx}`, pcie_slot: 'Slot 5', firmware: 'DOCA 2.6' },
      });
    }
    insertMaterial({
      code: `MEM-${server.code.slice(4)}-1`,
      name: `64GB 内存 ${server.code}`,
      type: 'memory',
      model: 'Samsung M393A8G40AB2',
      vendor: 'Samsung',
      status: 'in_use',
      rack_id: rackId,
      parent_id: server.id,
      slot: 'DIMM A1',
      spec: { capacity_gb: 64, mem_type: 'DDR4', speed_mhz: 3200, slot_index: 'DIMM A1', rank: '2Rx4' },
    });
  });

  // 服务器与交换机之间的连接线
  serverRows.slice(0, 6).forEach((server, idx) => {
    insertMaterial({
      code: `CBL-${server.code.slice(4)}-A`,
      name: `上联 DAC 线缆 ${server.code}`,
      type: 'cable',
      model: 'Mellanox MCP1600-C003',
      vendor: 'Mellanox',
      status: 'in_use',
      rack_id: server.rack.id,
      parent_id: server.id,
      slot: 'Uplink',
      spec: {
        cable_type: 'DAC',
        length_m: 3,
        from_device: server.code,
        from_port: 'eth0',
        to_device: `SW-${server.rack.name}`,
        to_port: `GE1/0/${idx + 1}`,
      },
    });
  });

  // 库存物料
  const spares = [
    { code: 'NIC-SP-001', name: '备用双口 25G 网卡', type: 'nic', model: 'Intel E810-XXVDA2', vendor: 'Intel', serial: 'NICSP001', spec: { interface: 'PCIe 4.0 x8', speed: '25GbE', pcie_slot: '—', firmware: '4.40' } },
    { code: 'DPU-SP-001', name: '备用 DPU', type: 'dpu', model: 'NVIDIA BlueField-2', vendor: 'NVIDIA', serial: 'DPUSP001', spec: { mode: 'DPU', pcie_slot: '—', firmware: 'DOCA 2.6' } },
    { code: 'MEM-SP-001', name: '备用 64GB 内存 A', type: 'memory', model: 'Samsung M393A8G40AB2', vendor: 'Samsung', serial: 'MEMSP001', spec: { capacity_gb: 64, mem_type: 'DDR4', speed_mhz: 3200, rank: '2Rx4' } },
    { code: 'MEM-SP-002', name: '备用 64GB 内存 B', type: 'memory', model: 'Samsung M393A8G40AB2', vendor: 'Samsung', serial: 'MEMSP002', spec: { capacity_gb: 64, mem_type: 'DDR4', speed_mhz: 3200, rank: '2Rx4' } },
    { code: 'SSD-SP-001', name: '备用 960GB SSD', type: 'disk', model: 'Samsung PM9A3', vendor: 'Samsung', serial: 'SSDSP001', spec: { capacity_gb: 960, disk_type: 'NVMe', interface: 'PCIe 4.0', slot_index: '—' } },
    { code: 'CBL-SP-001', name: '备用 100G AOC 线缆', type: 'cable', model: 'Mellanox MFA1A00-C005', vendor: 'Mellanox', serial: 'CBLSP001', spec: { cable_type: 'AOC', length_m: 5, from_device: '—', from_port: '—', to_device: '—', to_port: '—' } },
    { code: 'SFP-SP-001', name: '备用 25G 光模块', type: 'sfp', model: 'FS SFP-25G-SR', vendor: 'FS', serial: 'SFPSP001', spec: { form_factor: 'SFP28', speed: '25G', wavelength: '850nm', connector: 'LC' } },
    { code: 'SRV-SP-001', name: '备用计算节点', type: 'server', model: 'Dell PowerEdge R750', vendor: 'Dell', serial: 'SRVSP001', status: 'spare', spec: { cpu: '2 × Xeon Gold 6338', memory_total: '512 GB', disk: '2 × 960GB SSD', bmc_ip: '10.30.9.50', bmc_user: 'admin', bmc_password: 'Bmc@Spare2024!', os_ip: '10.20.9.50', os_user: 'root', os_password: 'Root@Spare2024!', os_type: 'Ubuntu 22.04 LTS' } },
  ];
  for (const spare of spares) {
    const id = insertMaterial({ ...spare, status: spare.status || 'spare', rack_id: null, spec: spare.spec });
    if (spare.type === 'server') {
      run(
        `INSERT INTO server_status (material_id, power_state, health, cpu_pct, mem_pct, temp_c, uptime_s, last_seen, metrics, updated_at)
         VALUES (?, 'off', 'offline', 0, 0, 22, 0, ?, '{}', ?)`,
        id,
        ts,
        ts,
      );
    }
  }

  run(
    `INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, summary, detail, ip, source, created_at)
     VALUES (NULL, 'system', 'system.seed', 'system', NULL, ?, ?, NULL, 'system', ?)`,
    '系统初始化：已导入 B02-B06 五个机柜与示例物料数据',
    JSON.stringify({
      racks: racks.length,
      servers: serverRows.length,
      materialTypes: Object.keys(MATERIAL_TYPES).length,
      statuses: Object.keys(MATERIAL_STATUSES).length,
      commands: Object.keys(COMMANDS).length,
      health: Object.keys(HEALTH_META).length,
    }),
    ts,
  );

  return { userId };
}