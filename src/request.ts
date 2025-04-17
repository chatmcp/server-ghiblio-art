import axios from 'axios';
import { getParamValue } from '@chatmcp/sdk/utils/index.js';

const DEBUG_MODE = getParamValue('debug') || false;
const API_BASE = DEBUG_MODE ? 'http://localhost:9999/gpt4o_image/' : 'https://api.ghiblio.art/gpt4o_image/';
const axiosInstance = axios.create({ validateStatus: () => true });

async function makeRequest<T>(apiKey: string, pathname: string, data?: Record<string, any>, method = 'GET'): Promise<T | null> {
  try {
    const url = API_BASE + pathname;
    const headers = { Accept: 'application/json', Authorization: `Bearer ${apiKey}` };
    const { status, data: response } = await axiosInstance({ url, method, headers, data });

    // const maskedApiKey = apiKey.slice(0, 4) + '...' + apiKey.slice(-4);
    // console.info(`request: ${JSON.stringify({ url, method, data, apiKey: maskedApiKey, status, response })}`);
    if (status !== 200 && !response) {
      const error: any = new Error(response.errorMessage || response.message || 'Unknown error');
      error.status = status;
      throw error;
    }
    return response as T;
  } catch (error: any) {
    const { status, name, message } = error;
    console.error(`Error making request: ${JSON.stringify({ status, name, message })}`);
    return { errorCode: status || 500, errorMessage: message || 'Unknown error', errorName: name || 'Unknown error' } as T;
  }
}

export default makeRequest;
