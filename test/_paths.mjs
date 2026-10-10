/**
 * 测试用的路径解析 —— **测试绝不往仓库外乱写**。
 *
 * 背景：这些测试原本硬编码了开发者本机的目录，比如
 *   F:/Deepseek_harness/输入法皮肤/06-工作记录/imgtest
 * 在别人机器上要么直接崩（盘不存在），要么往陌生人的文件系统里创建目录。
 * 那既不可移植也不礼貌。
 *
 * 现在分三类：
 *   TMP       临时目录（系统 temp 下），所有写操作都来这里
 *   SAMPLES   可选的真实 .ssf 样本目录（因版权不在仓库里）
 *   PROJECTS  可选的本地皮肤工程目录（同上）
 *
 * SAMPLES / PROJECTS 可以用环境变量指定，缺省时相关断言自动跳过：
 *   set SOGOU_SKIN_SAMPLES=D:\my-samples
 *   set SOGOU_SKIN_PROJECTS=D:\my-projects
 */
import { existsSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** 本次测试运行的临时目录，所有产物都写这里 */
export const TMP = mkdtempSync(join(tmpdir(), 'dsh-sogou-skin-test-'));

/** 在 TMP 下开一个子目录并返回路径 */
export function tmpDir(name) {
    const p = join(TMP, name);
    mkdirSync(p, { recursive: true });
    return p;
}

/** 可选的真实样本目录（放 .ssf）。为空表示没配。 */
export const SAMPLES = process.env.SOGOU_SKIN_SAMPLES || '';

/** 可选的本地皮肤工程根目录。为空表示没配。 */
export const PROJECTS = process.env.SOGOU_SKIN_PROJECTS || '';

/** 在 SAMPLES 下取一个样本；不存在返回 null */
export function sample(name) {
    if (!SAMPLES) return null;
    const p = join(SAMPLES, name);
    return existsSync(p) ? p : null;
}

/** 在 PROJECTS 下取一个工程；不存在返回 null */
export function project(name) {
    if (!PROJECTS) return null;
    const p = join(PROJECTS, name);
    return existsSync(p) ? p : null;
}

/**
 * 需要样本但没配时，打印一行说明并跳过。
 * @param {string} what 要做什么
 * @param {...(string|null)} deps 依赖的路径
 * @returns {boolean} true = 缺依赖，调用方应 return
 */
export function skip(what, ...deps) {
    if (deps.every((d) => d)) return false;
    console.log('  --  跳过：' + what + '（需要本地样本，见 test/README.md）');
    return true;
}
