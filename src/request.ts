import axios from 'axios';

const IS_PROD = process.env.NODE_ENV === 'production';
const API_BASE = IS_PROD ? 'http://api-store:6666/gpt4o_image/' : ' http://localhost:9999/gpt4o_image/'; // 线上通过docker共享网络实现内网访问
const axiosInstance = axios.create({ validateStatus: () => true });

async function makeRequest<T>(apiKey: string, pathname: string, data?: Record<string, any>, method = 'GET'): Promise<T | null> {
  try {
    const url = API_BASE + pathname;
    const headers = { Accept: 'application/json', Authorization: `Bearer ${apiKey}` };
    const { status, data: response } = await axiosInstance({ url, method, headers, data });

    const maskedApiKey = apiKey.slice(0, 4) + '...' + apiKey.slice(-4);
    // logger.info(`request: ${JSON.stringify({ url, method, data, apiKey: maskedApiKey, status, response })}`);
    if (status !== 200 && !response) {
      const error: any = new Error(response.errorMessage || response.message || 'Unknown error');
      error.status = status;
      throw error;
    }
    return response as T;
  } catch (error: any) {
    const { status, name, message } = error;
    // logger.error(`Error making request: ${JSON.stringify({ status, name, message })}`);
    return { errorCode: status || 500, errorMessage: message || 'Unknown error', errorName: name || 'Unknown error' } as T;
  }
}

export default makeRequest;
