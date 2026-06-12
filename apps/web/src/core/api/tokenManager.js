// Module-level variable to store the access token in memory
// This avoids React Context re-renders when the token is silently refreshed.
let accessToken = null;

export const setAccessToken = (token) => {
  accessToken = token;
};

export const getAccessToken = () => {
  return accessToken;
};

export const clearAccessToken = () => {
  accessToken = null;
};
