(function () {
  const api = axios.create({
    baseURL: window.location.origin,
    timeout: 15000,
    headers: {
      "Content-Type": "application/json",
    },
  });

  function messageFromError(error) {
    return error.response?.data?.error || error.message || "Request failed";
  }

  window.wordApi = {
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
