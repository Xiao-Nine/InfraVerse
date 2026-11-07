import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { COMMANDS, HEALTH_META, MATERIAL_STATUSES, TYPE_KEYS, materialTypeCatalog } from './types.js';
import {
  createMaterial,
  deleteMaterial,
  getMaterial,
  listMaterials,
  updateMaterial,
} from './materials.js';
import { createRack, deleteRack, listRacks, updateRack } from './racks.js';
import {
  ackCommand,
  dashboard,
  getServerStatus,
  listCommands,
  sendCommand,
  updateTelemetry,
} from './status.js';
import { listAudit } from './audit.js';

const materialRef = z.union([z.string(), z.number()]).describe('物料编码（如 SRV-B02-01）或物料 ID');

function textResult(data) {
  return {
    content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
  };
}

function tool(fn) {
  try {
    return textResult(fn());
  } catch (error) {
    const extra = error.details ? `\n${JSON.stringify(error.details)}` : '';
    return {
      isError: true,
      content: [{ type: 'text', text: `${error.message || '操作失败'}${extra}` }],
    };
  }
}

const specSchema = z.record(z.string(), z.any()).describe('类型专属字段（键值对象）。可先用 material_types 工具查看各类型字段');

/**
 * 创建一个绑定到具体用户的 MCP Server。
 * HTTP 模式每次请求创建；stdio 模式启动时创建。
 */
export function createMcpServer(ctx) {
  const server = new McpServer(
    { name: 'infraverse', version: '1.0.0' },
    {
      instructions: [
        'InfraVerse 是机房数字孪生与物料管理平台。你可以查询/新增/修改/删除物料、查询机柜、读写服务器状态、下发与确认指令、读取操作记录。',
        '物料编码（code）全局唯一。服务器类型支持 BMC 与 OS 两组凭据，字段位于 spec 中。',
        '位置由 rack（机柜名称）+ position_u（起始 U 位）+ u_height（占用 U 数）表示；服务器上的网卡/DPU/内存等部件通过 parent 关联到服务器。',
        '所有写操作都会记录操作日志，操作人来自当前 API Token 对应的用户。执行破坏性操作前请先确认目标。',
      ].join('\n'),
    },
  );

  server.registerTool(
    'whoami',
    {
      title: '当前身份',
      description: '查看当前 MCP 连接对应的用户与权限。所有人均为管理员。',
      annotations: { readOnlyHint: true },
    },
    async () => tool(() => ({ user: ctx.user, permissions: ['admin', 'all'] })),
  );

  server.registerTool(
    'material_types',
    {
      title: '物料类型与字段说明',
      description: '列出所有物料类型、状态、字段（含密码字段标记）以及支持的状态值/指令。添加物料前建议先调用。',
      annotations: { readOnlyHint: true },
    },
    async () =>
      tool(() => ({
        types: materialTypeCatalog(),
        statuses: MATERIAL_STATUSES,
        health: HEALTH_META,
        commands: COMMANDS,
        location_model:
          'rack（机柜名称或ID） + position_u（起始U位，1 为机柜最底部） + u_height（占用U数）。子物料使用 parent 字段关联到服务器/交换机，并用 slot 描述槽位。',
      })),
  );

  server.registerTool(
    'materials_search',
    {
      title: '搜索物料',
      description:
        '按关键词、类型、状态、机柜、父设备分页搜索物料。返回的密码字段会被掩码，需要凭据时调用 materials_get。',
      inputSchema: {
        q: z.string().optional().describe('关键词，可匹配物料编码/名称/型号/序列号/IP/机柜等，支持空格分隔多个词'),
        type: z.string().optional().describe(`类型，多个用逗号分隔：${TYPE_KEYS.join(',')}`),
        status: z.string().optional().describe('状态，多个用逗号分隔：in_use,spare,maintenance,fault,retired'),
        rack: z.string().optional().describe('机柜名称或 ID'),
        parent: materialRef.optional().describe('只看某台服务器/交换机下的部件'),
        root_only: z.boolean().optional().describe('只看顶层物料（不包含服务器内部部件）'),
        unplaced: z.boolean().optional().describe('只看未上架/库存物料'),
        page: z.number().int().min(1).optional(),
        page_size: z.number().int().min(1).max(500).optional(),
        sort: z.enum(['code', 'name', 'type', 'status', 'updated_at', 'position_u']).optional(),
        order: z.enum(['asc', 'desc']).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      tool(() =>
        listMaterials({
          ...args,
          parent_id: args.parent,
          root_only: args.root_only,
          unplaced: args.unplaced,
        }),
      ),
  );

  server.registerTool(
    'materials_get',
    {
      title: '查看物料详情',
      description:
        '按编码或 ID 获取物料完整信息（含 BMC/OS/DPU 密码等真实凭据）、位置、子物料与服务器实时状态。需要有效的 API Token。',
      inputSchema: { material: materialRef },
      annotations: { readOnlyHint: true },
    },
    async ({ material }) =>
      tool(() => {
        const result = getMaterial(material, { reveal: true, includeChildren: true });
        if (!result) throw new Error(`物料不存在：${material}`);
        return result;
      }),
  );

  server.registerTool(
    'materials_create',
    {
      title: '新增物料',
      description:
        '新增物料。服务器需提供 BMC/OS 信息（spec 字段）。同一机柜的 U 位不能重叠；服务器内部部件请设置 parent 与 slot。物料编码必须唯一。',
      inputSchema: {
        code: z.string().describe('物料编码，例如 SRV-B07-01 / NIC-B07-01-1'),
        name: z.string(),
        type: z.enum(TYPE_KEYS),
        status: z.enum(Object.keys(MATERIAL_STATUSES)).optional(),
        model: z.string().optional(),
        vendor: z.string().optional(),
        serial: z.string().optional(),
        rack: z.string().optional().describe('机柜名称或 ID'),
        position_u: z.number().int().min(1).optional().describe('起始 U 位，1 为最底部'),
        u_height: z.number().int().min(1).optional().describe('占用 U 数，默认 1'),
        slot: z.string().optional().describe('机柜内编号/槽位，例如 U12 或 PCIe Slot 3'),
        parent: materialRef.optional().describe('所属服务器/交换机编码或 ID'),
        spec: specSchema.optional(),
        note: z.string().optional(),
        force: z.boolean().optional().describe('忽略 U 位冲突（不建议）'),
      },
    },
    async (args) => tool(() => createMaterial(args, ctx, { source: 'mcp' })),
  );

  server.registerTool(
    'materials_update',
    {
      title: '修改物料',
      description:
        '修改物料字段。spec 采用合并语义（传入 null 或空字符串删除键）；传 rack_id: null 可下架。修改机柜/U 位会校验冲突。',
      inputSchema: {
        material: materialRef,
        code: z.string().optional(),
        name: z.string().optional(),
        type: z.enum(TYPE_KEYS).optional(),
        status: z.enum(Object.keys(MATERIAL_STATUSES)).optional(),
        model: z.string().nullable().optional(),
        vendor: z.string().nullable().optional(),
        serial: z.string().nullable().optional(),
        rack: z.string().optional(),
        rack_id: z.number().int().nullable().optional(),
        position_u: z.number().int().min(1).optional(),
        u_height: z.number().int().min(1).optional(),
        slot: z.string().nullable().optional(),
        parent: materialRef.nullable().optional(),
        parent_id: z.number().int().nullable().optional(),
        spec: specSchema.optional(),
        note: z.string().nullable().optional(),
        force: z.boolean().optional(),
      },
    },
    async ({ material, ...patch }) =>
      tool(() => updateMaterial(material, patch, ctx, { source: 'mcp' })),
  );

  server.registerTool(
    'materials_delete',
    {
      title: '删除物料',
      description: '删除物料。若存在子物料（如服务器下的网卡/DPU），需显式 cascade=true 级联删除。操作不可恢复。',
      inputSchema: {
        material: materialRef,
        cascade: z.boolean().optional().describe('级联删除所有子物料'),
        confirm: z.boolean().describe('必须为 true，用于确认删除'),
      },
    },
    async ({ material, cascade, confirm }) =>
      tool(() => {
        if (confirm !== true) throw new Error('删除操作需要 confirm=true 确认');
        return deleteMaterial(material, { cascade: Boolean(cascade) }, ctx, { source: 'mcp' });
      }),
  );

  server.registerTool(
    'racks_list',
    {
      title: '机柜列表',
      description: '查看所有机柜的位置、U 容量、占用率与设备数量。',
      annotations: { readOnlyHint: true },
    },
    async () => tool(() => listRacks()),
  );

  server.registerTool(
    'racks_create',
    {
      title: '新增机柜',
      description: '新增机柜并指定其在 3D 机房中的坐标（米）。默认机柜排成一行（z=0，rotation=0 面向 +Z），可自由设置 x / z / rotation。',
      inputSchema: {
        name: z.string(),
        row_label: z.string().optional(),
        col: z.number().int().optional(),
        x: z.number().optional().describe('3D 场景 X 坐标（米）'),
        z: z.number().optional().describe('3D 场景 Z 坐标（米）'),
        rotation: z.number().optional().describe('朝向弧度，0 表示面向 +Z'),
        u_height: z.number().int().min(1).max(60).optional(),
        power_capacity: z.string().optional(),
        note: z.string().optional(),
      },
    },
    async (args) => tool(() => createRack(args, ctx, { source: 'mcp' })),
  );

  server.registerTool(
    'racks_update',
    {
      title: '修改机柜',
      description: '修改机柜名称、坐标、朝向或容量。',
      inputSchema: {
        rack: z.union([z.string(), z.number()]),
        name: z.string().optional(),
        row_label: z.string().optional(),
        col: z.number().int().optional(),
        x: z.number().optional(),
        z: z.number().optional(),
        rotation: z.number().optional(),
        u_height: z.number().int().min(1).max(60).optional(),
        power_capacity: z.string().optional(),
        note: z.string().optional(),
      },
    },
    async ({ rack, ...patch }) => tool(() => updateRack(rack, patch, ctx, { source: 'mcp' })),
  );

  server.registerTool(
    'racks_delete',
    {
      title: '删除机柜',
      description: '删除空机柜。机柜内仍有设备时需 force=true 强制下架所有设备（设备将变为未上架）。',
      inputSchema: {
        rack: z.union([z.string(), z.number()]),
        force: z.boolean().optional(),
        confirm: z.boolean(),
      },
    },
    async ({ rack, force, confirm }) =>
      tool(() => {
        if (confirm !== true) throw new Error('删除操作需要 confirm=true 确认');
        return deleteRack(rack, { force: Boolean(force) }, ctx, { source: 'mcp' });
      }),
  );

  server.registerTool(
    'dashboard_overview',
    {
      title: '孪生总览',
      description: '获取物料统计、服务器在线/健康统计、机柜占用率和当前告警列表。',
      annotations: { readOnlyHint: true },
    },
    async () => tool(() => dashboard()),
  );

  server.registerTool(
    'server_status_get',
    {
      title: '查看服务器状态',
      description: '获取服务器的电源、健康、CPU、内存、温度、运行时长与最后上报时间。',
      inputSchema: { material: materialRef },
      annotations: { readOnlyHint: true },
    },
    async ({ material }) =>
      tool(() => {
        const status = getServerStatus(material);
        if (!status) throw new Error(`未找到服务器状态：${material}`);
        return status;
      }),
  );

  server.registerTool(
    'server_status_report',
    {
      title: '上报服务器状态',
      description:
        '由监控 Agent 写入/更新服务器遥测。仅需传变化的字段。可通过 material_status 同步更新物料状态（如故障）。',
      inputSchema: {
        material: materialRef,
        health: z.enum(Object.keys(HEALTH_META)).optional(),
        power_state: z.enum(['on', 'off', 'unknown']).optional(),
        cpu_pct: z.number().min(0).max(100).optional(),
        mem_pct: z.number().min(0).max(100).optional(),
        temp_c: z.number().min(-20).max(150).optional(),
        uptime_s: z.number().int().min(0).optional(),
        metrics: z.record(z.string(), z.any()).optional().describe('任意扩展指标'),
        material_status: z.enum(Object.keys(MATERIAL_STATUSES)).optional(),
      },
    },
    async ({ material, ...payload }) =>
      tool(() => updateTelemetry({ material_id: material, ...payload }, ctx, { source: 'mcp' })),
  );

  server.registerTool(
    'commands_send',
    {
      title: '下发服务器指令',
      description:
        '向服务器下发指令：ping（连通性检测）、locate（定位灯）、selftest（自检）、restart（重启）、power_off（关机）、power_on（开机）。',
      inputSchema: {
        material: materialRef,
        action: z.enum(Object.keys(COMMANDS)),
        params: z.record(z.string(), z.any()).optional(),
      },
    },
    async ({ material, action, params }) =>
      tool(() => sendCommand(material, action, params || {}, ctx, { source: 'mcp' })),
  );

  server.registerTool(
    'commands_list',
    {
      title: '查看指令队列',
      description: '查看指令记录，可按服务器或状态过滤。监控 Agent 可轮询 status=pending 的指令并执行。',
      inputSchema: {
        material: materialRef.optional(),
        status: z.enum(['pending', 'running', 'done', 'failed']).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => tool(() => listCommands(args)),
  );

  server.registerTool(
    'commands_ack',
    {
      title: '确认指令执行结果',
      description: 'Agent 执行完指令后回写状态：running / done / failed，并附执行结果。',
      inputSchema: {
        command_id: z.number().int(),
        status: z.enum(['running', 'done', 'failed']),
        result: z.string().optional(),
      },
    },
    async ({ command_id, status, result }) =>
      tool(() => ackCommand(command_id, { status, result }, ctx, { source: 'mcp' })),
  );

  server.registerTool(
    'logs_list',
    {
      title: '查看操作记录',
      description: '分页查询全系统操作记录（所有用户可见），可按关键词、动作类型、实体类型、用户名过滤。',
      inputSchema: {
        q: z.string().optional(),
        action: z.string().optional().describe('例如 material.create / material.update / material.delete / command.create / auth.login'),
        entity_type: z.string().optional(),
        username: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      tool(() =>
        listAudit({
          q: args.q,
          action: args.action,
          entityType: args.entity_type,
          username: args.username,
          limit: args.limit,
          offset: args.offset,
        }),
      ),
  );

  return server;
}