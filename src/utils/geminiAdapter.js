/**
 * Gemini API 格式适配器
 * 将标准 Gemini API 请求格式转换为 Antigravity 内部格式
 */

import config from '../config/config.js';
import { generateRequestId } from './idGenerator.js';

/**
 * 将标准 Gemini API 请求转换为 Antigravity 内部请求格式
 * @param {string} model - 模型名称
 * @param {object} geminiRequest - 标准 Gemini API 请求体
 * @param {object} token - 认证 token
 * @returns {object} Antigravity 内部请求格式
 */
export function convertGeminiToAntigravity(model, geminiRequest, token) {
    const {
        contents = [],
        generationConfig = {},
        systemInstruction,
        safetySettings,
        ...rest
    } = geminiRequest;

    // 合并用户传入的 generationConfig 与默认配置
    const mergedGenerationConfig = {
        topP: generationConfig.topP ?? config.defaults.top_p,
        topK: generationConfig.topK ?? config.defaults.top_k,
        temperature: generationConfig.temperature ?? config.defaults.temperature,
        maxOutputTokens: generationConfig.maxOutputTokens ?? config.defaults.max_tokens,
        candidateCount: generationConfig.candidateCount ?? 1,
        ...generationConfig
    };

    // 处理 systemInstruction，Gemini 标准格式支持 parts 数组
    let finalSystemInstruction;
    if (systemInstruction) {
        // 标准 Gemini 格式: { role: "user", parts: [{ text: "..." }] } 或简化格式 { parts: [...] }
        finalSystemInstruction = {
            role: systemInstruction.role || 'user',
            parts: systemInstruction.parts || [{ text: config.systemInstruction || '' }]
        };
    } else if (config.systemInstruction) {
        finalSystemInstruction = {
            role: 'user',
            parts: [{ text: config.systemInstruction }]
        };
    } else {
        finalSystemInstruction = {
            role: 'user',
            parts: [{ text: '' }]
        };
    }

    return {
        project: token.projectId,
        requestId: generateRequestId(),
        request: {
            contents,
            systemInstruction: finalSystemInstruction,
            generationConfig: mergedGenerationConfig,
            sessionId: token.sessionId,
            ...rest
        },
        model,
        userAgent: 'antigravity'
    };
}

/**
 * 清理单个 part 对象，移除非标准字段
 * @param {object} part - 原始 part 对象
 * @returns {object} 清理后的 part 对象
 */
function sanitizePart(part) {
    if (!part || typeof part !== 'object') return part;

    // 复制 part 对象，排除 thoughtSignature 字段
    const { thoughtSignature, ...cleanPart } = part;
    return cleanPart;
}

/**
 * 清理 candidate 对象，确保 parts 中不包含非标准字段
 * @param {object} candidate - 原始 candidate 对象
 * @param {number} index - candidate 索引
 * @returns {object} 清理后的 candidate 对象
 */
function sanitizeCandidate(candidate, index) {
    if (!candidate || typeof candidate !== 'object') return candidate;

    const result = { ...candidate };

    // 确保 index 字段存在
    if (result.index === undefined) {
        result.index = index;
    }

    // 清理 content.parts
    if (result.content && Array.isArray(result.content.parts)) {
        result.content = {
            ...result.content,
            parts: result.content.parts.map(sanitizePart)
        };
    }

    return result;
}

/**
 * 从 Antigravity 响应中提取标准 Gemini 响应格式
 * @param {object} antigravityResponse - Antigravity 响应
 * @returns {object} 标准 Gemini API 响应格式
 */
export function extractGeminiResponse(antigravityResponse) {
    // Antigravity 响应格式: { response: { candidates: [...], usageMetadata: {...} } }
    // 标准 Gemini 响应格式: { candidates: [...], usageMetadata: {...} }
    let response = antigravityResponse;
    if (antigravityResponse && antigravityResponse.response) {
        response = antigravityResponse.response;
    }

    // 如果没有 candidates，直接返回
    if (!response || !Array.isArray(response.candidates)) {
        return response;
    }

    // 清理每个 candidate
    return {
        ...response,
        candidates: response.candidates.map((candidate, idx) => sanitizeCandidate(candidate, idx))
    };
}

/**
 * 将内部模型列表转换为标准 Gemini 模型列表格式
 * @param {object} internalModels - 内部模型列表 { models: { modelId: {...}, ... } }
 * @returns {object} 标准 Gemini 模型列表格式
 */
export function convertToGeminiModelList(internalModels) {
    const modelIds = Object.keys(internalModels.models || {});

    return {
        models: modelIds.map(id => ({
            name: `models/${id}`,
            version: '001',
            displayName: id,
            description: `Model ${id}`,
            inputTokenLimit: 1048576,
            outputTokenLimit: 8192,
            supportedGenerationMethods: ['generateContent', 'streamGenerateContent']
        }))
    };
}

/**
 * 解析流式响应行并转换为标准 Gemini 格式
 * @param {string} line - SSE 数据行
 * @returns {string|null} 转换后的 SSE 行，如果无需转换则返回 null
 */
export function transformStreamLine(line) {
    if (!line.startsWith('data: ')) return line;

    try {
        const data = JSON.parse(line.slice(6));

        // Antigravity 流式响应格式: { response: { candidates: [...] } }
        // 需要提取 response 部分
        let geminiData = data.response ? data.response : data;

        // 清理 candidates：确保包含 index 字段，并移除 thoughtSignature 等非标准字段
        if (geminiData.candidates && Array.isArray(geminiData.candidates)) {
            geminiData = {
                ...geminiData,
                candidates: geminiData.candidates.map((candidate, idx) => sanitizeCandidate(candidate, idx))
            };
        }

        return `data: ${JSON.stringify(geminiData)}`;
    } catch (e) {
        // JSON 解析失败，原样返回
        return line;
    }
}
