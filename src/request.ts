import axios from 'axios';

const API_BASE = 'https://api.ghiblio.art/gpt4o_image/';
// const API_BASE = 'http://localhost:9999/gpt4o_image/';
const axiosInstance = axios.create({ validateStatus: () => true });

async function makeRequest<T>(apiKey: string, pathname: string, data?: Record<string, any>, method = 'GET'): Promise<T | null> {
  try {
    const url = API_BASE + pathname;
    const headers = { Accept: 'application/json', Authorization: `Bearer ${apiKey}` };
    const { status, data: response } = await axiosInstance({ url, method, headers, data });

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
