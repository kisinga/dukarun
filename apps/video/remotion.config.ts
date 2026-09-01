import { Config } from '@remotion/cli/config';

Config.setChromeMode('chrome-for-testing');
const browserExecutable = process.env['REMOTION_BROWSER_EXECUTABLE']?.trim();
if (browserExecutable) Config.setBrowserExecutable(browserExecutable);
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setCodec('h264');
Config.setPixelFormat('yuv420p');
Config.setAudioCodec('aac');
