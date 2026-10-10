// @ts-check
/**
 * DSH 搜狗皮肤工坊 —— 插件入口。
 * 刻意保持零第三方依赖：PNG/BMP 编解码、ZIP 与 v3 加密容器、皮肤装配与预览渲染全部自实现，
 * 因此不需要构建步骤、不需要装包，直接以 ESM 被 DSH 加载即可。
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerTools } from './tools.js';

export const name = '@dsh-external/dsh-sogou-skin';
export const inject = ['tools', 'skills'];

/** 配置项（不依赖 schemastery，纯默认值合并）。 */
export const defaultConfig = {
    /** 皮肤工程的默认根目录；工具里的相对路径都按它解析 */
    projectsRoot: '',
};

/**
 * @param {any} ctx
 * @param {Partial<typeof defaultConfig>} [config]
 */
export function apply(ctx, config = {}) {
    const cfg = { ...defaultConfig, ...(config || {}) };
    const projectsRoot = cfg.projectsRoot
        ? resolve(cfg.projectsRoot)
        : resolve(process.cwd(), 'sogou-skins');

    const toolsResult = registerTools(ctx, { projectsRoot });
    const skillRegistered = registerSkill(ctx);

    const msg = '[sogou-skin] 已加载：' + toolsResult.registered + ' 个 skin_* 工具'
        + (skillRegistered ? ' + sogou-skin-authoring 技能' : '（技能未注册）')
        + '，工程根目录 = ' + projectsRoot;
    ctx?.logger?.info?.(msg);
    console.log(msg);
}

/** @param {any} ctx */
function registerSkill(ctx) {
    const skills = ctx?.skills;
    if (!skills || typeof skills.register !== 'function') return false;
    try {
        const dir = dirname(fileURLToPath(import.meta.url));
        const skillDir = join(dir, '..', 'skills', 'sogou-skin-authoring');
        const raw = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
        const parsed = parseSkillMarkdown(raw);
        if (!parsed) return false;
        const disposer = skills.register({
            name: 'sogou-skin-authoring',
            description: parsed.description,
            content: parsed.body,
            provider: 'dsh-sogou-skin',
            source: 'bundled',
            resourceBase: { kind: 'directory', path: skillDir },
            invocation: { modelInvocable: true, userInvocable: true },
        });
        if (typeof ctx.effect === 'function') ctx.effect(() => disposer, '[sogou-skin] skill sogou-skin-authoring');
        return true;
    } catch (e) {
        ctx?.logger?.warn?.('[sogou-skin] 技能注册失败：' + String(e));
        return false;
    }
}

/** @param {string} raw */
function parseSkillMarkdown(raw) {
    const lines = raw.split(/\r?\n/);
    if (lines[0]?.trim() !== '---') return null;
    let close = -1;
    for (let i = 1; i < lines.length; i++) if (lines[i].trim() === '---') { close = i; break; }
    if (close < 0) return null;
    const fm = lines.slice(1, close).join('\n');
    const m = /^description:\s*(.+)$/m.exec(fm);
    if (!m || !m[1].trim()) return null;
    return { description: m[1].trim(), body: lines.slice(close + 1).join('\n').replace(/^\n+/, '') };
}
