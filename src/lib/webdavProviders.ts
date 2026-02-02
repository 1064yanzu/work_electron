/**
 * WebDAV 服务商预设配置
 * 参考 Cherry Studio 实现，支持主流 WebDAV 服务
 */

export interface WebDavProvider {
  id: string;
  name: string;
  nameZh: string;
  host: string;
  defaultPath: string;
  helpUrl?: string;
  description: string;
  requiresAppPassword?: boolean;
  icon?: string;
}

/**
 * 主流 WebDAV 服务商预设
 */
export const WEBDAV_PROVIDERS: WebDavProvider[] = [
  {
    id: 'custom',
    name: 'Custom',
    nameZh: '自定义',
    host: '',
    defaultPath: '/',
    description: '手动输入 WebDAV 服务器地址',
  },
  {
    id: 'jianguoyun',
    name: 'Nutstore (坚果云)',
    nameZh: '坚果云',
    host: 'https://dav.jianguoyun.com/dav/',
    defaultPath: '/workbench-sync',
    helpUrl: 'https://help.jianguoyun.com/?p=2064',
    description: '国内稳定的 WebDAV 服务，需使用应用密码',
    requiresAppPassword: true,
    icon: '🥜',
  },
  {
    id: 'nextcloud',
    name: 'Nextcloud',
    nameZh: 'Nextcloud',
    host: 'https://your-domain.com/remote.php/dav/files/username/',
    defaultPath: '/workbench-sync',
    helpUrl: 'https://docs.nextcloud.com/server/latest/user_manual/en/files/access_webdav.html',
    description: '开源自托管云存储方案，需替换 your-domain 和 username',
    icon: '☁️',
  },
  {
    id: 'owncloud',
    name: 'ownCloud',
    nameZh: 'ownCloud',
    host: 'https://your-domain.com/remote.php/dav/files/username/',
    defaultPath: '/workbench-sync',
    helpUrl: 'https://doc.owncloud.com/server/user_manual/files/access_webdav.html',
    description: '开源云存储解决方案，需替换 your-domain 和 username',
    icon: '☁️',
  },
  {
    id: 'infomaniak',
    name: 'Infomaniak kDrive',
    nameZh: 'Infomaniak kDrive',
    host: 'https://drive.infomaniak.com/app/webdav/',
    defaultPath: '/workbench-sync',
    helpUrl: 'https://www.infomaniak.com/en/support/faq/2399/kdrive-accessing-kdrive-using-webdav',
    description: '瑞士隐私云存储服务',
    icon: '🇨🇭',
  },
  {
    id: 'teracloud',
    name: 'TeraCloud',
    nameZh: 'TeraCloud',
    host: 'https://tera-1.cloud.jp/dav/',
    defaultPath: '/workbench-sync',
    helpUrl: 'https://teracloud.jp/en/clients.html',
    description: '日本云存储服务，提供免费 10GB 空间',
    icon: '🇯🇵',
  },
  {
    id: 'box',
    name: 'Box',
    nameZh: 'Box',
    host: 'https://dav.box.com/dav',
    defaultPath: '/workbench-sync',
    helpUrl: 'https://support.box.com/hc/en-us/articles/360043696414-WebDAV-with-Box',
    description: '企业级云存储服务',
    icon: '📦',
  },
  {
    id: 'koofr',
    name: 'Koofr',
    nameZh: 'Koofr',
    host: 'https://app.koofr.net/dav/Koofr',
    defaultPath: '/workbench-sync',
    helpUrl: 'https://koofr.eu/help/webdav/',
    description: '欧洲云存储服务',
    icon: '🇪🇺',
  },
  {
    id: 'yandex',
    name: 'Yandex Disk',
    nameZh: 'Yandex 网盘',
    host: 'https://webdav.yandex.com',
    defaultPath: '/workbench-sync',
    helpUrl: 'https://yandex.com/support/disk-desktop-win/webdav.html',
    description: '俄罗斯云存储服务',
    icon: '🇷🇺',
  },
  {
    id: 'synology',
    name: 'Synology NAS',
    nameZh: '群晖 NAS',
    host: 'http://your-nas-ip:5005',
    defaultPath: '/workbench-sync',
    helpUrl: 'https://kb.synology.com/en-global/DSM/tutorial/How_to_access_files_on_Synology_NAS_with_WebDAV',
    description: '群晖 NAS WebDAV 服务，需替换 IP 地址',
    icon: '🖥️',
  },
  {
    id: 'qnap',
    name: 'QNAP NAS',
    nameZh: '威联通 NAS',
    host: 'http://your-nas-ip:8080',
    defaultPath: '/workbench-sync',
    helpUrl: 'https://www.qnap.com/en/how-to/faq/article/how-do-i-use-webdav',
    description: '威联通 NAS WebDAV 服务，需替换 IP 地址',
    icon: '🖥️',
  },
];

/**
 * 根据 ID 获取服务商配置
 */
export function getProviderById(id: string): WebDavProvider | undefined {
  return WEBDAV_PROVIDERS.find((p) => p.id === id);
}

/**
 * 根据主机地址猜测服务商
 */
export function guessProviderByHost(host: string): WebDavProvider | undefined {
  if (!host) return undefined;

  const normalizedHost = host.toLowerCase();

  // 精确匹配
  for (const provider of WEBDAV_PROVIDERS) {
    if (provider.id === 'custom') continue;
    if (normalizedHost.includes(provider.host.toLowerCase())) {
      return provider;
    }
  }

  // 模糊匹配
  if (normalizedHost.includes('jianguoyun.com')) {
    return getProviderById('jianguoyun');
  }
  if (normalizedHost.includes('nextcloud')) {
    return getProviderById('nextcloud');
  }
  if (normalizedHost.includes('owncloud')) {
    return getProviderById('owncloud');
  }
  if (normalizedHost.includes('infomaniak.com')) {
    return getProviderById('infomaniak');
  }
  if (normalizedHost.includes('teracloud') || normalizedHost.includes('cloud.jp')) {
    return getProviderById('teracloud');
  }
  if (normalizedHost.includes('box.com')) {
    return getProviderById('box');
  }
  if (normalizedHost.includes('koofr')) {
    return getProviderById('koofr');
  }
  if (normalizedHost.includes('yandex')) {
    return getProviderById('yandex');
  }

  return undefined;
}

/**
 * 验证 WebDAV URL 格式
 */
export function validateWebdavUrl(url: string): { valid: boolean; message?: string } {
  if (!url) {
    return { valid: false, message: '请输入 WebDAV 地址' };
  }

  try {
    const parsed = new URL(url);

    // 检查协议
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, message: '仅支持 HTTP 或 HTTPS 协议' };
    }

    // 建议使用 HTTPS
    if (parsed.protocol === 'http:' && !parsed.hostname.match(/^(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/)) {
      return { valid: true, message: '⚠️ 建议使用 HTTPS 以保护数据安全' };
    }

    return { valid: true };
  } catch {
    return { valid: false, message: 'URL 格式不正确' };
  }
}
