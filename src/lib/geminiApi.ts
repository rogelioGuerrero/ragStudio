import { GoogleGenAI } from '@google/genai';

export async function withExponentialBackoff<T>(
  apiCall: () => Promise<T>,
  maxRetries: number = 4,
  logCallback?: (msg: string) => void,
  cancelRef?: React.MutableRefObject<boolean>
): Promise<T> {
  let retries = 0;
  while (retries < maxRetries) {
    if (cancelRef?.current) {
      throw new Error("Cancelled by user");
    }
    
    try {
      return await apiCall();
    } catch (error: any) {
      const status = error?.status;
      // Also catch 503 Service Unavailable or 500 Internal Server Error
      if ((status === 429 || status === 503 || status === 500) && retries < maxRetries - 1) {
        const delayMs = Math.pow(2, retries) * 1000 + Math.random() * 1000;
        if (logCallback) {
          logCallback(`[API Error ${status}] Rate limit or service unavailable. Retrying in ${Math.round(delayMs)}ms... (Attempt ${retries + 1}/${maxRetries - 1})`);
        }
        await new Promise(resolve => setTimeout(resolve, delayMs));
        retries++;
      } else {
        throw error;
      }
    }
  }
  throw new Error("Max retries exceeded");
}
