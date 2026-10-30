// A JWT is stale when the account's password changed after the token was
// issued. `iat` is in seconds, so the comparison is made at second precision.
const isTokenStale = (decoded, user) => {
  if (!user?.passwordChangedAt) return false;

  const changedAtSeconds = Math.floor(new Date(user.passwordChangedAt).getTime() / 1000);

  return typeof decoded?.iat !== "number" || decoded.iat < changedAtSeconds;
};

module.exports = { isTokenStale };
