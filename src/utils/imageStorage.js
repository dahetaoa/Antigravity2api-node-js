import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config/config.js';
import log from './logger.js';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IMAGE_DIR = path.join(__dirname, '../../public/images');

// 确保图片目录存在
if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
}

// MIME 类型到文件扩展名映射
const MIME_TO_EXT = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp'
};

/**
 * 获取默认 IP 地址
 */
function getDefaultIp() {
    const interfaces = os.networkInterfaces();
    // 尝试 WLAN
    if (interfaces.WLAN) {
        for (const inter of interfaces.WLAN) {
            if (inter.family === 'IPv4' && !inter.internal) {
                return inter.address;
            }
        }
    }
    // 尝试 wlan2
    if (interfaces.wlan2) {
        for (const inter of interfaces.wlan2) {
            if (inter.family === 'IPv4' && !inter.internal) {
                return inter.address;
            }
        }
    }
    // 尝试 eth0
    if (interfaces.eth0) {
        for (const inter of interfaces.eth0) {
            if (inter.family === 'IPv4' && !inter.internal) {
                return inter.address;
            }
        }
    }
    // 遍历所有接口查找第一个非内部 IPv4 地址
    for (const name of Object.keys(interfaces)) {
        for (const inter of interfaces[name]) {
            if (inter.family === 'IPv4' && !inter.internal) {
                return inter.address;
            }
        }
    }
    return '127.0.0.1';
}

/**
 * 清理超过限制数量的旧图片
 * @param {number} maxCount - 最大保留图片数量
 */
function cleanOldImages(maxCount = 10) {
    try {
        const files = fs.readdirSync(IMAGE_DIR)
            .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
            .map(f => ({
                name: f,
                path: path.join(IMAGE_DIR, f),
                mtime: fs.statSync(path.join(IMAGE_DIR, f)).mtime.getTime()
            }))
            .sort((a, b) => b.mtime - a.mtime);

        if (files.length > maxCount) {
            files.slice(maxCount).forEach(f => {
                try {
                    fs.unlinkSync(f.path);
                } catch (e) {
                    log.warn(`删除旧图片失败: ${f.name}`);
                }
            });
        }
    } catch (e) {
        log.warn(`清理旧图片失败: ${e.message}`);
    }
}

/**
 * 保存 base64 图片到本地并返回访问 URL
 * @param {string} base64Data - base64 编码的图片数据
 * @param {string} mimeType - 图片 MIME 类型
 * @returns {string} 图片访问 URL
 */
export function saveBase64Image(base64Data, mimeType) {
    const ext = MIME_TO_EXT[mimeType] || 'jpg';
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;
    const filepath = path.join(IMAGE_DIR, filename);

    // 解码并保存
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filepath, buffer);

    // 清理旧图片
    const maxImages = config.imageSettings?.maxImages || 10;
    cleanOldImages(maxImages);

    // 返回访问 URL
    const baseUrl = config.imageSettings?.baseUrl || `http://${getDefaultIp()}:${config.server.port}`;

    return `${baseUrl}/images/${filename}`;
}

/**
 * 获取图片目录路径
 */
export function getImageDir() {
    return IMAGE_DIR;
}

export { getDefaultIp };
