import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isAllowed, getWhitelistConfig, resetWhitelistCache } from './whitelist.js';

// Mock getConfig
vi.mock('../config/index.js', () => ({
  getConfig: vi.fn(() => ({
    allowedNumbers: 'all',
  })),
}));

import { getConfig } from '../config/index.js';

const mockedGetConfig = vi.mocked(getConfig);

describe('whitelist', () => {
  beforeEach(() => {
    resetWhitelistCache();
    vi.clearAllMocks();
    mockedGetConfig.mockReturnValue({ allowedNumbers: 'all' } as any);
  });

  describe('getWhitelistConfig', () => {
    it('should return mode "all" when allowedNumbers is "all"', () => {
      const config = getWhitelistConfig();
      expect(config.mode).toBe('all');
      expect(config.allowedNumbers.size).toBe(0);
      expect(config.allowedGroups.size).toBe(0);
    });

    it('should return mode "all" when allowedNumbers is empty', () => {
      mockedGetConfig.mockReturnValue({ allowedNumbers: '' } as any);
      const config = getWhitelistConfig();
      expect(config.mode).toBe('all');
    });

    it('should return mode "whitelist" with specific numbers', () => {
      mockedGetConfig.mockReturnValue({ allowedNumbers: '1234567890,9876543210' } as any);
      const config = getWhitelistConfig();
      expect(config.mode).toBe('whitelist');
      expect(config.allowedNumbers.has('1234567890')).toBe(true);
      expect(config.allowedNumbers.has('9876543210')).toBe(true);
    });

    it('should separate group JIDs from number JIDs', () => {
      mockedGetConfig.mockReturnValue({
        allowedNumbers: '1234567890,120363-012345@g.us',
      } as any);
      const config = getWhitelistConfig();
      expect(config.allowedNumbers.has('1234567890')).toBe(true);
      expect(config.allowedGroups.size).toBe(1);
    });

    it('should detect groups by dash in identifier', () => {
      mockedGetConfig.mockReturnValue({
        allowedNumbers: '120363-012345',
      } as any);
      const config = getWhitelistConfig();
      expect(config.allowedGroups.has('120363-012345')).toBe(true);
    });

    it('should normalize JIDs (strip @s.whatsapp.net)', () => {
      mockedGetConfig.mockReturnValue({
        allowedNumbers: '1234567890@s.whatsapp.net',
      } as any);
      const config = getWhitelistConfig();
      expect(config.allowedNumbers.has('1234567890')).toBe(true);
    });

    it('should cache the config', () => {
      getWhitelistConfig();
      getWhitelistConfig();
      // getConfig should only be called once due to caching
      expect(mockedGetConfig).toHaveBeenCalledTimes(1);
    });

    it('should trim entries', () => {
      mockedGetConfig.mockReturnValue({
        allowedNumbers: '  1234567890 , 9876543210  ',
      } as any);
      const config = getWhitelistConfig();
      expect(config.allowedNumbers.has('1234567890')).toBe(true);
      expect(config.allowedNumbers.has('9876543210')).toBe(true);
    });
  });

  describe('isAllowed', () => {
    it('should allow everyone when mode is "all"', () => {
      expect(isAllowed('anyone@s.whatsapp.net', 'anychat@s.whatsapp.net')).toBe(true);
    });

    it('should allow whitelisted numbers', () => {
      mockedGetConfig.mockReturnValue({ allowedNumbers: '1234567890' } as any);
      expect(isAllowed('1234567890@s.whatsapp.net', '1234567890@s.whatsapp.net')).toBe(true);
    });

    it('should reject non-whitelisted numbers', () => {
      mockedGetConfig.mockReturnValue({ allowedNumbers: '1234567890' } as any);
      expect(isAllowed('9999999999@s.whatsapp.net', '9999999999@s.whatsapp.net')).toBe(false);
    });

    it('should allow messages in whitelisted groups', () => {
      mockedGetConfig.mockReturnValue({ allowedNumbers: '120363-012345@g.us' } as any);
      expect(isAllowed('9999999999@s.whatsapp.net', '120363-012345@g.us')).toBe(true);
    });

    it('should reject messages in non-whitelisted groups', () => {
      mockedGetConfig.mockReturnValue({ allowedNumbers: '120363-012345@g.us' } as any);
      expect(isAllowed('9999999999@s.whatsapp.net', '999999-999999@g.us')).toBe(false);
    });

    it('should allow whitelisted sender even in non-whitelisted group', () => {
      mockedGetConfig.mockReturnValue({ allowedNumbers: '1234567890' } as any);
      expect(isAllowed('1234567890@s.whatsapp.net', '999999-999999@g.us')).toBe(true);
    });
  });

  describe('resetWhitelistCache', () => {
    it('should force config reload on next call', () => {
      getWhitelistConfig();
      expect(mockedGetConfig).toHaveBeenCalledTimes(1);

      resetWhitelistCache();
      getWhitelistConfig();
      expect(mockedGetConfig).toHaveBeenCalledTimes(2);
    });
  });
});
