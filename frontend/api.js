(function () {
  const API_URL = window.JTR_API_URL || "https://jack-the-reaper.vercel.app";
  const api = axios.create({
    baseURL: API_URL,
    timeout: 15000,
    headers: {
      "Content-Type": "application/json",
    },
  });

  function messageFromError(error) {
    return error.response?.data?.error || error.message || "Request failed";
  }

  window.wordApi = {
    apiUrl: API_URL,
    async sendWords(text) {
      try {
        const response = await api.post("/words", { text });
        return response.data;
      } catch (error) {
        throw new Error(messageFromError(error));
      }
    },
  };
})();
