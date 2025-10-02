// ==================== 全局配置和常量 ====================
const BOT_COMMAND = 'pdzs';
const MAX_TEXT_MESSAGE_LENGTH = 4096;
const MAX_CAPTION_LENGTH = 1024;

const DEFAULT_CONFIG = {
  footer: { enabled: false, text: "\n\nexample", links: [{ text: "example", url: "https://example.com" }] },
  bannedWords: [],
  forwardOptimization: false,
  disablePreview: true,
  separator: "|",
  forwardPosition: 'none',
  viaWord: 'via ',
  deleteSystemMessages: false
};

const HELP_TEXT = `📌 /pdzs footer
功能概括：设置频道帖子底部的页脚内容，支持多链接/仅添加文字，或完全禁用页脚
参数：填写Markdown链接文本（如"示例 (https://t.me/example)"）或"none"禁用页脚
实例：
   - 禁用页脚：/pdzs footer none
   - 设置页脚：/pdzs footer "\[text1\] (https://t.me/link) \| text2 \| \[text3\] (https://t.me/link)"

📌 /pdzs delword
功能概括：设置需要自动屏蔽的关键词（支持正则），匹配到的内容会被删除
参数：填写用于屏蔽的正则表达式（如" 广告 "或"spam|phishing"），或"none"清除所有屏蔽词
实例：
   - 屏蔽包含"广告"的词：/pdzs delword "广告"
   - 清除所有屏蔽词：/pdzs delword none
   - 追加屏蔽词：/pdzs delword add "spam"

📌 /pdzs forward
功能概括：设置转发消息时的来源显示方式，优化转发内容的可读性
参数：填写转发优化模式，可选"off"（关闭）、"inline"（内联显示来源）、"newline"（新行显示来源）
实例：
   - 关闭转发优化：/pdzs forward off
   - 内联显示来源：/pdzs forward inline
   - 新行显示来源：/pdzs forward newline

📌 /pdzs dispreview
功能概括：控制频道帖子中链接的预览功能，禁用后不会显示链接预览卡片
参数：填写"on"启用链接预览禁用，或"off"关闭禁用
实例：
   - 禁用链接预览：/pdzs dispreview on

📌 /pdzs sep
功能概括：自定义转发消息中来源前缀与内容的分隔符
参数：填写分隔符（如"|"），或"none"设置为空格
实例：
   - 设置分隔符为"|"：/pdzs sep |
   - 设置分隔符为空格：/pdzs sep none

📌 /pdzs viaword
功能概括：设置转发消息时显示的来源前缀，让来源更清晰
参数：填写来源前缀文本（如"via @bot"）
实例：
   - 设置来源前缀为"来源："：/pdzs viaword 来源：

📌 /pdzs delsys
功能概括：自动删除频道中的系统消息（如加入成员提示、置顶提示）
参数：填写"on"启用系统消息自动删除，或"off"关闭
实例：
   - 启用系统消息删除：/pdzs delsys on

📌 /pdzs reset
功能概括：重置频道配置为默认值，清除所有自定义设置
实例：/pdzs reset

📌 /pdzs config
功能概括：查看当前频道的所有配置状态
实例：/pdzs config

另外：
1. 消息尾部如果添加一个"nopdzs"，机器人会将其还原为没有经过任何处理的消息
2. 回复消息并发送"/pdzs"可重新处理原始消息

此机器人仅支持在频道中使用，输入对应指令即可进行配置~`; // 保持原样

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') return new Response('Ciallo～(∠・ω< )⌒☆', { status: 200 });
    try {
      const BOT_TOKEN = env.BOT_TOKEN;
      const pdzsConfig = env.pdzsConfig;
      if (!BOT_TOKEN) return new Response('BOT_TOKEN未配置', { status: 500 });
      const botHandler = new BotHandler(BOT_TOKEN, pdzsConfig);
      const update = await request.json();
      await botHandler.handleUpdate(update);
      return new Response('OK');
    } catch (error) {
      console.error('处理请求失败:', error);
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  }
};

// ==================== Telegram API 客户端 ====================
class TelegramAPI {
  constructor(token) {
    if (!token) throw new Error('Telegram Bot Token 必须提供');
    this.baseUrl = `https://api.telegram.org/bot${token.trim()}`;
  }

  async request(endpoint, data) {
    try {
      const res = await fetch(`${this.baseUrl}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`API请求失败 (${endpoint}): ${res.status} - ${errorText}`);
        return { ok: false, error: { code: res.status, message: res.statusText, details: errorText } };
      }
      return await res.json();
    } catch (error) {
      console.error(`API请求失败 (${endpoint}):`, error);
      return { ok: false, error: { message: error.message } };
    }
  }

  async editMessage(chatId, messageId, { text, entities, isMedia, disablePreview = true }) {
    const data = { chat_id: chatId, message_id: messageId, disable_web_page_preview: disablePreview };
    if (isMedia) {
      data.caption = text || '';
      if (entities?.length) data.caption_entities = entities; // 修正：媒体消息用caption_entities
      return this.request('editMessageCaption', data);
    } else {
      data.text = text || '';
      if (entities?.length) data.entities = entities;
      return this.request('editMessageText', data);
    }
  }

  async sendMessage(chatId, { text, entities, media, disablePreview = true }) {
    const data = { chat_id: chatId, disable_web_page_preview: disablePreview };
    if (media) {
      data[media.type] = media.file_id;
      if (text) data.caption = text;
      if (entities?.length) data.caption_entities = entities; // 修正：媒体消息用caption_entities
      return this.request(`send${media.type.charAt(0).toUpperCase() + media.type.slice(1)}`, data);
    }
    data.text = text || '';
    if (entities?.length) data.entities = entities;
    return this.request('sendMessage', data);
  }

  async deleteMessage(chatId, messageId) {
    return this.request('deleteMessage', { chat_id: chatId, message_id: messageId });
  }

  async editCommandResponse(chatId, messageId, text) {
    return this.request('editMessageText', {
      chat_id: chatId, message_id: messageId, text: text || '', disable_web_page_preview: true, parse_mode: 'Markdown' // 修正：强制Markdown
    });
  }

  async sendHelp(chatId, text) {
    return this.sendMessage(chatId, { text, disablePreview: true, parse_mode: 'Markdown' }); // 修正：强制Markdown
  }

  // 补充 getChat、createChatInviteLink 方法用于频道来源URL补全
  async getChat(chatId) {
    return this.request('getChat', { chat_id: chatId });
  }
  async createChatInviteLink(chatId) {
    return this.request('createChatInviteLink', { chat_id: chatId });
  }
}

// ==================== 工具函数模块 ====================
const Utils = {
  // 基础文本处理
  textLength: text => text ? text.length : 0,
  endsWith: (text, suffix) => text && text.trim().endsWith(suffix),
  removeSuffix: (text, suffix) => Utils.endsWith(text, suffix) ? text.trim().slice(0, -suffix.length).trim() : text,

  // 消息类型判断
  isMediaMessage: message => message.photo || message.video || message.document || message.audio || message.voice || message.video_note || message.sticker || message.animation,
  isMediaGroupMessage: message => message.media_group_id !== undefined,
  // 修正：支持所有转发字段
  isForwardedMessage: message =>
    !!(message.forward_origin || message.forward_from_chat || message.forward_from),
  isCommandMessage: message => (message.text || message.caption || '').startsWith(`/${BOT_COMMAND}`),
  isSystemMessage: message => (
    message.chat_shared ||
    message.new_chat_title ||
    message.new_chat_photo ||
    message.delete_chat_photo ||
    message.video_chat_started ||
    message.video_chat_ended ||
    message.left_chat_member ||
    message.new_chat_members ||
    message.pinned_message // 修正：判断置顶消息
  ),
  isReplyToPdzsCommand: message => (message.text || message.caption || '').trim() === `/${BOT_COMMAND}` && message.reply_to_message,

  // 实体处理
  mergeEntities: (...entitySets) => entitySets.flat().filter(Boolean),

  // 页脚解析
  parseFooterSegments: (text, separator = "|") => {
    if (!text) return [];
    const segments = [];
    const lines = text.split('\n');
    for (const line of lines) {
      const parts = line.split(separator).map(part => part.trim());
      for (const part of parts) {
        const linkMatch = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (linkMatch) {
          segments.push({
            text: linkMatch[1].trim(),
            url: linkMatch[2].trim().toLowerCase() === 'none' ? null : linkMatch[2].trim()
          });
        } else if (part) {
          segments.push({ text: part, url: null });
        }
      }
    }
    return segments;
  },

  generatePlainTextLinks: (links, separator = "|", returnUrls = false) => {
    if (!links || !links.length) return '';
    if (returnUrls) {
      return links.map(link => link.url ? `[${link.text}](${link.url})` : link.text).join(` ${separator} `);
    }
    return links.map(link => link.text).join(` ${separator} `);
  },

  // 获取转发来源信息（修复频道识别 & 兼容 forward_from_chat）
  getForwardSource: async function(forwardOrigin, api = null, message = null) {
    // 自动兼容所有转发来源结构
    if (!forwardOrigin && message) {
      if (message.forward_from_chat) {
        forwardOrigin = {
          type: 'channel',
          chat: message.forward_from_chat,
          message_id: message.forward_from_message_id
        };
      } else if (message.forward_from) {
        forwardOrigin = {
          type: 'user',
          sender_user: message.forward_from
        };
      }
    }
    if (!forwardOrigin) return null;

    const { type } = forwardOrigin;
    const getSource = {
      channel: async () => {
        const chat = forwardOrigin.chat;
        let url = null;
        if (chat?.username) {
          url = `https://t.me/${chat.username}/${forwardOrigin.message_id || ''}`;
        } else if (api && chat?.id) {
          try {
            const chatInfo = await api.getChat(chat.id);
            if (chatInfo?.invite_link) {
              url = chatInfo.invite_link;
            } else {
              const inviteResult = await api.createChatInviteLink(chat.id);
              if (inviteResult?.ok) url = inviteResult.result.invite_link;
            }
          } catch (error) {
            url = `https://t.me/c/${Math.abs(chat.id)}/${forwardOrigin.message_id || ''}`;
          }
        } else if (chat?.id) {
          url = `https://t.me/c/${Math.abs(chat.id)}/${forwardOrigin.message_id || ''}`;
        }
        return {
          type: 'channel',
          name: chat?.title || chat?.username || '未知频道',
          username: chat?.username,
          url,
          messageId: forwardOrigin.message_id
        };
      },
      user: () => {
        const user = forwardOrigin.sender_user;
        const url = user?.username ? `https://t.me/${user.username}` : null;
        return {
          type: 'user',
          name: `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || '未知用户',
          username: user?.username,
          url,
          isBot: user?.is_bot || false
        };
      },
      hidden_user: () => ({
        type: 'hidden_user',
        name: forwardOrigin.sender_user_name || '匿名用户',
        username: null,
        url: null,
        isBot: false
      }),
      chat: async () => {
        const chat = forwardOrigin.sender_chat;
        let url = null;
        if (chat?.username) {
          url = `https://t.me/${chat.username}`;
        } else if (api && chat?.id) {
          try {
            const chatInfo = await api.getChat(chat.id);
            if (chatInfo?.invite_link) {
              url = chatInfo.invite_link;
            } else {
              const inviteResult = await api.createChatInviteLink(chat.id);
              if (inviteResult?.ok) url = inviteResult.result.invite_link;
            }
          } catch (error) {
            url = `https://t.me/c/${Math.abs(chat.id)}`;
          }
        } else if (chat?.id) {
          url = `https://t.me/c/${Math.abs(chat.id)}`;
        }
        return {
          type: 'chat',
          name: chat?.title || '未知群组',
          username: chat?.username,
          url,
          isBot: false
        };
      }
    };

    const sourceGetter = getSource[type];
    if (!sourceGetter) return null;
    const source = await sourceGetter();
    if (!source) return null;
    if (source.isBot) source.name = `${source.name} 🤖`;
    return source;
  },

  // 正则表达式解析（完整保留）
  parseRegex: pattern => {
    try {
      if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
        const lastSlashIndex = pattern.lastIndexOf('/');
        const regexPattern = pattern.substring(1, lastSlashIndex);
        const flags = pattern.substring(lastSlashIndex + 1);
        return new RegExp(regexPattern, flags);
      }
      return new RegExp(pattern, 'gi');
    } catch {
      return null;
    }
  },

  // 配置显示格式化（完整保留）
  formatConfigDisplay: (config, chatId) => {
    const lines = [
      `🛠️ *频道配置概览* 🛠️`,
      `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬`,
      `📝 *页脚设置*: ${config.footer.enabled ? '✅ 已启用' : '❌ 已禁用'}`,
      config.footer.enabled ? `   📋 内容: ${Utils.generatePlainTextLinks(config.footer.links, config.separator)}` : '',
      ``,
      `🚫 *屏蔽词*: ${config.bannedWords.length ? `✅ ${config.bannedWords.length}个规则` : '❌ 未设置'}`,
      ``,
      `⏩ *转发优化*: ${config.forwardOptimization ? '✅ 已启用' : '❌ 已禁用'}`,
      config.forwardOptimization ? `   📍 位置: ${config.forwardPosition === 'newline' ? '新行显示' : '内联显示'}` : '',
      ``,
      `🔗 *链接预览*: ${config.disablePreview ? '❌ 已禁用' : '✅ 已启用'}`,
      ``,
      `⚙️ *分隔符*: ${config.separator === ' ' ? '空格' : `"${config.separator}"`}`,
      ``,
      `📍 *来源前缀*: "${config.viaWord}"`,
      ``,
      `🗑️ *系统消息删除*: ${config.deleteSystemMessages ? '✅ 已启用' : '❌ 已禁用'}`,
      `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬`
    ].filter(line => line !== '');

    return lines.join('\n');
  },

  // 获取媒体信息
  getMediaInfo: (message) => {
    if (message.photo) {
      const lastPhoto = message.photo.slice(-1)[0];
      return lastPhoto ? { type: 'photo', file_id: lastPhoto.file_id } : null;
    }
    if (message.video) return { type: 'video', file_id: message.video.file_id };
    if (message.document) return { type: 'document', file_id: message.document.file_id };
    if (message.audio) return { type: 'audio', file_id: message.audio.file_id };
    if (message.animation) return { type: 'animation', file_id: message.animation.file_id };
    if (message.voice) return { type: 'voice', file_id: message.voice.file_id };
    if (message.video_note) return { type: 'video_note', file_id: message.video_note.file_id };
    if (message.sticker) return { type: 'sticker', file_id: message.sticker.file_id };
    return null;
  }
};

// ==================== 配置管理模块（完整保留） ====================
class ConfigManager {
  constructor(kvStore) {
    this.kvStore = kvStore;
  }

  async getConfig(chatId) {
    if (!this.kvStore) {
      console.log('KV存储未初始化，使用默认配置');
      return { ...DEFAULT_CONFIG };
    }
    
    try {
      const configJson = await this.kvStore.get(`config_${chatId}`);
      if (!configJson) {
        console.log(`未找到chatId ${chatId}的配置，使用默认配置`);
        return { ...DEFAULT_CONFIG };
      }
      
      const config = JSON.parse(configJson);
      console.log(`成功加载chatId ${chatId}的配置`);
      
      const result = {
        ...DEFAULT_CONFIG,
        ...config,
        footer: {
          ...DEFAULT_CONFIG.footer,
          ...(config.footer || {})
        },
        bannedWords: (config.bannedWords || []).map(item => {
          if (item && item.type === 'regex') {
            try {
              return new RegExp(item.source, item.flags);
            } catch (e) {
              console.error('正则表达式解析失败:', e);
              return null;
            }
          }
          return item;
        }).filter(Boolean)
      };
      
      return result;
    } catch (error) {
      console.error('获取配置失败:', error);
      return { ...DEFAULT_CONFIG };
    }
  }

  async setConfig(chatId, config) {
    if (!this.kvStore) {
      console.error('KV存储未初始化，无法保存配置');
      return false;
    }
    
    try {
      const toStore = {
        ...config,
        bannedWords: config.bannedWords.map(item => {
          if (item instanceof RegExp) {
            return {
              type: 'regex',
              source: item.source,
              flags: item.flags
            };
          }
          return item;
        })
      };
      
      await this.kvStore.put(`config_${chatId}`, JSON.stringify(toStore));
      console.log(`成功保存chatId ${chatId}的配置`);
      return true;
    } catch (error) {
      console.error('保存配置失败:', error);
      return false;
    }
  }

  async clearConfig(chatId) {
    if (!this.kvStore) {
      console.error('KV存储未初始化，无法清空配置');
      return false;
    }
    
    try {
      await this.kvStore.delete(`config_${chatId}`);
      console.log(`成功清空chatId ${chatId}的配置`);
      return true;
    } catch (error) {
      console.error('清空配置失败:', error);
      return false;
    }
  }
}

// ==================== 消息处理器模块 ====================
class MessageProcessor {
  constructor(configManager) {
    this.configManager = configManager;
  }

  // 屏蔽词处理（完整保留）
  processBannedWords(text, entities = [], bannedWords) {
    if (!text || !bannedWords?.length) return { text, entities };
  
    // 建立码元→码点映射
    const codeMap = [];
    let pt = 0;
    for (let i = 0; i < text.length; ) {
      const cp = text.codePointAt(i);
      const dz = cp > 0xffff ? 2 : 1;
      for (let k = 0; k < dz; k++) codeMap[i + k] = pt;
      i += dz; pt++;
    }
  
    const chars = [...text];
    const validRe = bannedWords.filter(r => r instanceof RegExp);
    if (!validRe.length) return { text, entities };
  
    // 收集匹配区间
    const intervals = [];
    validRe.forEach(re => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        if (!m[0]) { re.lastIndex++; continue; }
        const start16 = m.index;
        const end16 = start16 + m[0].length;
        intervals.push({ startPt: codeMap[start16], endPt: codeMap[end16 - 1] + 1 });
      }
    });
  
    if (!intervals.length) return { text, entities };
  
    // 按码点从后往前删除
    intervals.sort((a, b) => b.startPt - a.startPt);
    let newChars = [...chars];
    intervals.forEach(({ startPt, endPt }) => newChars.splice(startPt, endPt - startPt));
  
    // 计算位移量
    const deltaMap = new Array(chars.length).fill(0);
    let accum = 0, ptr = 0;
    intervals.forEach(({ startPt, endPt }) => {
      while (ptr < startPt) deltaMap[ptr++] = accum;
      accum += endPt - startPt;
      for (let i = startPt; i < endPt; i++) deltaMap[i] = accum;
      ptr = endPt;
    });
    while (ptr < chars.length) deltaMap[ptr++] = accum;
  
    // 调整实体偏移量
    const newEntities = entities.map(en => {
      const newOff = Math.max(0, en.offset - deltaMap[en.offset]);
      const newEnd = Math.max(0, (en.offset + en.length) - deltaMap[en.offset + en.length - 1]);
      return { ...en, offset: newOff, length: newEnd - newOff };
    }).filter(en => en.length > 0);
  
    return { text: newChars.join(''), entities: newEntities };
  }

  // 构建完整消息文本（修复newline模式顺序：消息\n\n来源\n\n页脚）
  buildFullText(text, config, forwardSource = null) {
    let parts = [];
    if (text) parts.push(text);

    // 来源 newline 模式
    if (
      forwardSource &&
      config.forwardOptimization &&
      config.forwardPosition === 'newline'
    ) {
      const viaText = (config.viaWord || 'via ') + forwardSource.name;
      if (viaText && forwardSource.name) parts.push(viaText);
    }

    // 页脚
    let footerText = '';
    if (config.footer.enabled && config.footer.links?.length) {
      footerText = Utils.generatePlainTextLinks(config.footer.links, config.separator || '|');
      if (footerText) parts.push(footerText);
    }

    return parts.join('\n\n');
  }

  // 页脚与来源的实体构建（修正newline模式实体偏移）
  buildEntities(baseText, baseEntities = [], config, forwardSource = null) {
    let entities = [...(baseEntities || [])];
    let offset = Utils.textLength(baseText);

    // 来源 newline模式
    let sourceOffset = offset;
    if (
      forwardSource &&
      config.forwardOptimization &&
      config.forwardPosition === 'newline'
    ) {
      const viaWord = config.viaWord || 'via ';
      const viaText = viaWord + forwardSource.name;
      if (viaText && forwardSource.name) {
        sourceOffset = offset + 2;
        if (forwardSource.url) {
          entities.push({
            type: 'text_link',
            offset: sourceOffset + Utils.textLength(viaWord),
            length: Utils.textLength(forwardSource.name),
            url: forwardSource.url
          });
        }
        offset = sourceOffset + Utils.textLength(viaText);
      }
    }

    // 页脚实体
    if (config.footer.enabled && config.footer.links?.length) {
      let footerOffset = offset;
      if (
        forwardSource &&
        config.forwardOptimization &&
        config.forwardPosition === 'newline'
      ) {
        footerOffset = sourceOffset + Utils.textLength((config.viaWord || 'via ') + forwardSource.name) + 2;
      } else {
        footerOffset += 2;
      }
      let currentFooterOffset = footerOffset;
      config.footer.links.forEach((link, index) => {
        if (index > 0) currentFooterOffset += Utils.textLength(` ${config.separator || '|'} `);
        if (link.url) {
          entities.push({
            type: 'text_link',
            offset: currentFooterOffset,
            length: Utils.textLength(link.text),
            url: link.url
          });
        }
        currentFooterOffset += Utils.textLength(link.text);
      });
    }

    // inline模式原逻辑不变
    if (
      forwardSource &&
      config.forwardOptimization &&
      config.forwardPosition === 'inline'
    ) {
      const viaWord = config.viaWord || 'via ';
      const viaLen = Utils.textLength(viaWord);
      const sourceNameLen = Utils.textLength(forwardSource.name);
      if (config.footer.enabled && config.footer.links?.length) {
        const separatorLen = Utils.textLength(` ${config.separator || '|'} `);
        offset += separatorLen;
        if (forwardSource.url) {
          entities.push({
            type: 'text_link',
            offset: offset + viaLen,
            length: sourceNameLen,
            url: forwardSource.url
          });
        }
        offset += viaLen + sourceNameLen;
      } else {
        offset += 2;
        if (forwardSource.url) {
          entities.push({
            type: 'text_link',
            offset: offset + viaLen,
            length: sourceNameLen,
            url: forwardSource.url
          });
        }
        offset += viaLen + sourceNameLen;
      }
    }

    return entities;
  }
};

// ==================== 命令处理器模块 ====================
class CommandHandler {
  constructor(api, configManager) {
    this.api = api;
    this.configManager = configManager;
    this.commands = {
      footer: this._handleFooter.bind(this),
      delword: this._handleDelword.bind(this),
      forward: this._handleForward.bind(this),
      dispreview: this._handleDispreview.bind(this),
      sep: this._handleSep.bind(this),
      viaword: this._handleViaword.bind(this),
      delsys: this._handleDelsys.bind(this),
      config: this._handleConfig.bind(this),
      reset: this._handleReset.bind(this),
      help: this._handleHelp.bind(this)
    };
  }

  // 修正命令参数提取方式，只分割一次
  async handleCommand(chatId, messageId, command, args, text) {
    const handler = this.commands[command];
    if (!handler) {
      return await this.api.editCommandResponse(chatId, messageId, `❌未知命令: ${command}`);
    }
    try {
      const response = await handler(chatId, args, text);
      if (response) await this.api.editCommandResponse(chatId, messageId, response);
    } catch (error) {
      console.error(`处理命令 ${command} 失败:`, error);
      await this.api.editCommandResponse(chatId, messageId, `❌处理命令时发生错误: ${error.message}`);
    }
  }

  async _handleFooter(chatId, args, text) {
    if (args[0]?.toLowerCase() === 'none') {
      const config = await this.configManager.getConfig(chatId);
      config.footer.enabled = false;
      config.footer.links = [];
      return (await this.configManager.setConfig(chatId, config)) ? '✅页脚已禁用' : '❌设置失败';
    }
    // 只分割一次，取footer内容
    const match = text.match(/^\/pdzs\s+footer\s+([\s\S]*)$/i);
    const footerContent = match ? match[1].trim() : '';
    if (!footerContent) return '❌页脚内容不能为空';
    const config = await this.configManager.getConfig(chatId);
    const separator = config.separator || '|';
    const links = Utils.parseFooterSegments(footerContent, separator);
    if (!links.length) return '❌未检测到有效的页脚内容';
    config.footer = { enabled: true, links, text: `\n\n${Utils.generatePlainTextLinks(links, separator)}` };
    return (await this.configManager.setConfig(chatId, config)) ? '✅页脚设置成功' : '❌设置失败';
  }

  async _handleDelword(chatId, args) {
    if (!args.length) return '❌请提供正则表达式、"none"或"add"';
    const config = await this.configManager.getConfig(chatId);
    if (args[0].toLowerCase() === 'none') {
      config.bannedWords = [];
      return (await this.configManager.setConfig(chatId, config)) ? '✅屏蔽词已清除' : '❌设置失败';
    }
    if (args[0].toLowerCase() === 'add' && args[1]) {
      const regex = Utils.parseRegex(args[1]);
      if (!regex) return '❌正则表达式格式错误';
      config.bannedWords.push(regex);
      return (await this.configManager.setConfig(chatId, config)) ? `✅已追加屏蔽词，现有${config.bannedWords.length}条` : '❌设置失败';
    }
    const regex = Utils.parseRegex(args[0]);
    if (!regex) return '❌正则表达式格式错误';
    config.bannedWords = [regex];
    return (await this.configManager.setConfig(chatId, config)) ? '✅屏蔽词设置成功' : '❌设置失败';
  }

  async _handleForward(chatId, args) {
    if (!args.length) return '❌请填写off/none/newline/inline';
    
    const value = args[0].toLowerCase();
    if (!['off', 'none', 'newline', 'inline'].includes(value)) return '❌参数必须为off/none/newline/inline之一';
    
    const config = await this.configManager.getConfig(chatId);
    config.forwardOptimization = value !== 'off';
    config.forwardPosition = value === 'off' ? 'none' : value;
    
    return (await this.configManager.setConfig(chatId, config)) ? `✅转发优化已${value === 'off' ? '关闭' : '开启'}` : '❌设置失败';
  }

  async _handleDispreview(chatId, args) {
    if (!args.length) return '❌请填写on或off';
    
    const config = await this.configManager.getConfig(chatId);
    config.disablePreview = args[0].toLowerCase() === 'on';
    
    return (await this.configManager.setConfig(chatId, config)) ? `✅链接预览已${config.disablePreview ? '禁用' : '开启'}` : '❌设置失败';
  }

  async _handleSep(chatId, args) {
    if (!args.length) return '❌请提供分隔符内容';
    
    const config = await this.configManager.getConfig(chatId);
    config.separator = args[0].toLowerCase() === 'none' ? ' ' : args[0];
    
    return (await this.configManager.setConfig(chatId, config)) ? `✅分隔符已设置为: ${config.separator === ' ' ? '空格' : config.separator}` : '❌设置失败';
  }

  async _handleViaword(chatId, args) {
    if (!args.length) return '❌请提供来源前缀文本';
    
    const config = await this.configManager.getConfig(chatId);
    config.viaWord = args.join(' ');
    
    return (await this.configManager.setConfig(chatId, config)) ? `✅来源前缀已设置为: ${config.viaWord}` : '❌设置失败';
  }

  async _handleDelsys(chatId, args) {
    if (!args.length) return '❌请填写on或off';
    
    const config = await this.configManager.getConfig(chatId);
    config.deleteSystemMessages = args[0].toLowerCase() === 'on';
    
    return (await this.configManager.setConfig(chatId, config)) ? `✅系统消息自动删除已${config.deleteSystemMessages ? '开启' : '关闭'}` : '❌设置失败';
  }

  async _handleConfig(chatId) {
    const config = await this.configManager.getConfig(chatId);
    return Utils.formatConfigDisplay(config, chatId);
  }

  async _handleReset(chatId) {
    return (await this.configManager.clearConfig(chatId)) ? '✅配置已重置为默认值' : '❌重置失败';
  }

  async _handleHelp(chatId) {
    return HELP_TEXT;
  }
}

// ==================== 主处理器模块 ====================
class BotHandler {
  constructor(token, kvStore) {
    if (!token) throw new Error('Bot Token 必须提供');
    this.api = new TelegramAPI(token);
    this.configManager = new ConfigManager(kvStore);
    this.processor = new MessageProcessor(this.configManager);
    this.commandHandler = new CommandHandler(this.api, this.configManager);
  }

  async handleUpdate(update) {
    try {
      if (update?.message?.chat?.type === 'private') {
        return await this._handlePrivateMessage(update.message);
      }
      if (update?.channel_post) {
        return await this._handleChannelPost(update.channel_post);
      }
    } catch (error) {
      console.error('处理更新失败:', error);
    }
  }

  async _handlePrivateMessage(message) {
    const responseText = message.text?.toLowerCase() === '/help' ? HELP_TEXT : '此机器人仅支持在频道中使用，请发送 /help 查看详细说明';
    try {
      await this.api.sendHelp(message.chat.id, responseText); // 修正：强制Markdown
    } catch (error) {
      console.error('回复私聊消息失败:', error);
    }
  }

  async _handleChannelPost(message) {
    const chatId = message.chat.id;
    if (Utils.isReplyToPdzsCommand(message)) {
      return await this._handlePdzsReply(chatId, message);
    }
    if (await this._handleSystemMessageDeletion(chatId, message)) return;
    if (!Utils.isForwardedMessage(message) && await this._handleNoPdzsTag(chatId, message)) return;
    if (Utils.isCommandMessage(message)) return await this._handleCommandMessage(chatId, message);
    return await this._handleRegularMessage(chatId, message);
  }

  async _handleSystemMessageDeletion(chatId, message) {
    const config = await this.configManager.getConfig(chatId);
    if (!config.deleteSystemMessages || !Utils.isSystemMessage(message)) return false;
    try {
      await this.api.deleteMessage(chatId, message.message_id);
      return true;
    } catch (error) {
      console.error('删除系统消息失败:', error);
      return false;
    }
  }

  async _handleNoPdzsTag(chatId, message) {
    const messageText = message.text || message.caption || '';
    if (!Utils.endsWith(messageText, 'nopdzs')) return false;
    try {
      const newText = Utils.removeSuffix(messageText, 'nopdzs');
      await this.api.editMessage(chatId, message.message_id, {
        text: newText,
        entities: message.entities || message.caption_entities || [],
        isMedia: Utils.isMediaMessage(message),
        disablePreview: true
      });
      return true;
    } catch (error) {
      console.error('处理nopdzs标记失败:', error);
      return false;
    }
  }

  async _handleCommandMessage(chatId, message) {
    const text = message.text || message.caption || '';
    // 修复命令参数提取方式
    const match = text.match(/^\/pdzs\s+([^\s]+)\s*([\s\S]*)$/i);
    if (!match) return;
    const command = match[1];
    const argsStr = match[2].trim();
    // 用空格分割参数，但保留整体字符串
    const args = argsStr ? argsStr.split(/\s+/) : [];
    await this.commandHandler.handleCommand(chatId, message.message_id, command, args, text);
  }

  async _handleRegularMessage(chatId, message) {
    const config = await this.configManager.getConfig(chatId);
    // 跳过转发的媒体组消息
    if (Utils.isMediaGroupMessage(message) && Utils.isForwardedMessage(message)) {
      console.log('检测到转发的媒体组消息，跳过处理');
      return;
    }
    // 优化：用完整页脚判断是否已处理
    const messageText = message.text || message.caption || '';
    if (config.footer.enabled && config.footer.text && messageText.includes(config.footer.text.trim())) {
      return;
    }
    // 处理转发消息
    if (config.forwardOptimization && Utils.isForwardedMessage(message)) {
      // 修复转发来源识别，传递 message 以支持兼容结构
      return await this._handleForwardedMessage(chatId, message, config);
    }
    // 处理普通消息
    return await this._processAndEditMessage(chatId, message, config);
  }

  async _handleForwardedMessage(chatId, message, config) {
    if (Utils.isMediaGroupMessage(message)) {
      console.log('检测到转发的媒体组消息，跳过处理');
      return;
    }
    const entities = message.entities || message.caption_entities || [];
    // 修复转发来源识别（传递 message）
    const forwardSource = await Utils.getForwardSource(message.forward_origin, this.api, message);
    const { text, entities: processedEntities } = this.processor.processBannedWords(
      message.text || message.caption || '', entities, config.bannedWords
    );
    const fullText = this.processor.buildFullText(text, config, forwardSource);
    const isMedia = Utils.isMediaMessage(message);
    const maxLength = isMedia ? MAX_CAPTION_LENGTH : MAX_TEXT_MESSAGE_LENGTH;
    if (fullText.length > maxLength) {
      await this.api.sendMessage(chatId, {
        text: '❌消息内容过长，无法处理，请简化内容后再试。',
        disablePreview: true,
        parse_mode: 'Markdown'
      }); // 修正：超长消息主动提示
      return;
    }
    const newEntities = this.processor.buildEntities(text, processedEntities, config, forwardSource);
    try {
      await this.api.sendMessage(chatId, {
        text: fullText,
        entities: newEntities,
        media: Utils.getMediaInfo(message),
        disablePreview: config.disablePreview
      });
      await this.api.deleteMessage(chatId, message.message_id);
    } catch (error) {
      console.error('处理转发消息失败:', error);
    }
  }

  async _processAndEditMessage(chatId, message, config) {
    if (Utils.isMediaGroupMessage(message) && !message.caption && !message.text) {
      console.log('媒体组消息中没有标题，跳过处理');
      return;
    }
    const messageText = message.text || message.caption || '';
    const entities = message.entities || message.caption_entities || [];
    const hasMedia = Utils.isMediaMessage(message);
    // 修复转发来源识别（传递 message）
    const forwardSource = await Utils.getForwardSource(message.forward_origin, this.api, message);
    const { text, entities: filteredEntities } = this.processor.processBannedWords(
      messageText, entities, config.bannedWords
    );
    const fullText = this.processor.buildFullText(text, config, forwardSource);
    const maxLength = hasMedia ? MAX_CAPTION_LENGTH : MAX_TEXT_MESSAGE_LENGTH;
    if (fullText.length > maxLength) {
      await this.api.sendMessage(chatId, {
        text: '❌消息内容过长，无法处理，请简化内容后再试。',
        disablePreview: true,
        parse_mode: 'Markdown'
      }); // 修正：超长消息主动提示
      return;
    }
    const newEntities = this.processor.buildEntities(text, filteredEntities, config, forwardSource);
    try {
      await this.api.editMessage(chatId, message.message_id, {
        text: fullText,
        entities: newEntities,
        isMedia: hasMedia,
        disablePreview: config.disablePreview
      });
    } catch (editError) {
      console.error('编辑消息失败，尝试发送新消息:', editError);
      try {
        await this.api.sendMessage(chatId, {
          text: fullText,
          entities: newEntities,
          media: Utils.getMediaInfo(message),
          disablePreview: config.disablePreview
        });
        await this.api.deleteMessage(chatId, message.message_id);
      } catch (sendError) {
        console.error('发送新消息失败:', sendError);
      }
    }
  }

  async _reprocessAndSendMessage(chatId, originalMessage, config) {
    const messageText = originalMessage.text || originalMessage.caption || '';
    const entities = originalMessage.entities || originalMessage.caption_entities || [];
    const hasMedia = Utils.isMediaMessage(originalMessage);
    // 修复转发来源识别（传递 message）
    const forwardSource = await Utils.getForwardSource(originalMessage.forward_origin, this.api, originalMessage);
    
    // 处理屏蔽词
    const { text, entities: filteredEntities } = this.processor.processBannedWords(
      messageText, entities, config.bannedWords
    );
    
    // 构建完整消息
    const fullText = this.processor.buildFullText(text, config, forwardSource);
    const maxLength = hasMedia ? MAX_CAPTION_LENGTH : MAX_TEXT_MESSAGE_LENGTH;
    
    if (fullText.length > maxLength) {
      console.warn('消息过长，跳过处理');
      return;
    }
    
    // 构建实体
    const newEntities = this.processor.buildEntities(text, filteredEntities, config, forwardSource);
    
    try {
      await this.api.sendMessage(chatId, {
        text: fullText,
        entities: newEntities,
        media: Utils.getMediaInfo(originalMessage),
        disablePreview: config.disablePreview
      });
    } catch (error) {
      console.error('重新发送处理后的消息失败:', error);
    }
  }
}
