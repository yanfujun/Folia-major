// dev/i18n/emitTraditionalLocale.mjs
// 从 src/i18n/locales/zh-CN.ts 生成 src/i18n/locales/zh-TW.ts。
//
// 用法：
//   node dev/i18n/emitTraditionalLocale.mjs          # 写文件
//   node dev/i18n/emitTraditionalLocale.mjs --check  # 只比对，不写；不一致时退出码 1
//
// 为什么是「生成 + 签入产物」而不是运行时转换：i18n 的三份 locale 都是签入仓库的
// 静态模块，运行时转换会让每次 t() 调用都多一层开销，也会让「实际渲染成什么」
// 无法静态审查。生成脚本换成 zh-CN 的每一个字符串字面量的内容，结构原样保留，
// 所以 key 顺序、缩进、引号、`\\"` 转义都与 zh-CN 逐行对齐，diff 只有文案本身。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAst } from 'vite';
import { toTaiwanTraditional } from './localeTextRewrite.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SOURCE_PATH = path.join(ROOT, 'src/i18n/locales/zh-CN.ts');
const TARGET_PATH = path.join(ROOT, 'src/i18n/locales/zh-TW.ts');

const HEADER = `// src/i18n/locales/zh-TW.ts
// 台湾正体（台湾惯用词）文案。由 dev/i18n/emitTraditionalLocale.mjs 从 zh-CN.ts 生成，
// 结构逐行对齐、只换文案；改动请改脚本或 dev/i18n/traditionalTerms.mjs 后重跑生成，
// 不要手改本文件——下一次生成会覆盖。
`;

/**
 * 只收集**值位置**的字符串字面量。
 * 键也是 Literal 节点，靠 Property 分支把 n.key 跳过，避免把键也翻译一遍
 * （虽然键都是 ASCII，转了也看不出问题，但这会让「只改文案」的保证失效）。
 */
const collectValueLiterals = (ast) => {
    const literals = [];
    const walk = (node) => {
        if (!node || typeof node !== 'object') {
            return;
        }
        if (Array.isArray(node)) {
            node.forEach(walk);
            return;
        }
        if (typeof node.type !== 'string' || node.start === undefined) {
            return;
        }
        if (node.type === 'Property') {
            walk(node.value);
            return;
        }
        if (node.type === 'Literal' && typeof node.value === 'string') {
            literals.push({ start: node.start, end: node.end, value: node.value });
            return;
        }
        for (const key of Object.keys(node)) {
            if (key === 'type' || key === 'loc' || key === 'range' || key === 'parent') {
                continue;
            }
            walk(node[key]);
        }
    };
    walk(ast);
    return literals;
};

/**
 * 按 parseAst 给的 start/end 逐个换掉字符串字面量。
 * 必须从后往前替换，否则前面的替换会移动后面字面量的偏移。
 */
const renderTraditional = (source) => {
    const ast = parseAst(source, { lang: 'ts' });
    const literals = collectValueLiterals(ast);
    let output = source;
    for (let index = literals.length - 1; index >= 0; index -= 1) {
        const { start, end, value } = literals[index];
        output = output.slice(0, start) + JSON.stringify(toTaiwanTraditional(value)) + output.slice(end);
    }
    return { output: HEADER + output, literalCount: literals.length };
};

const source = fs.readFileSync(SOURCE_PATH, 'utf8');
const { output, literalCount } = renderTraditional(source);

if (process.argv.includes('--check')) {
    const current = fs.existsSync(TARGET_PATH) ? fs.readFileSync(TARGET_PATH, 'utf8') : null;
    if (current !== output) {
        console.error(
            `[folia-i18n] zh-TW.ts 与 zh-CN.ts 不同步（${literalCount} 条文案）。`
            + '跑 `node dev/i18n/emitTraditionalLocale.mjs` 重新生成。',
        );
        process.exit(1);
    }
    console.log(`[folia-i18n] zh-TW.ts 已同步（${literalCount} 条文案）。`);
} else {
    fs.writeFileSync(TARGET_PATH, output);
    console.log(`[folia-i18n] 写出 ${path.relative(ROOT, TARGET_PATH)}（${literalCount} 条文案）。`);
}
