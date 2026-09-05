/**
 * GitHub Sync Module for Chat + File Share
 * Automatically synchronizes user registrations to data/users.json in GitHub
 * when deployed on Vercel or running anywhere with GITHUB_TOKEN configured.
 */

const GITHUB_REPO = process.env.GITHUB_REPO || 'praveenk3139/chat-file-share';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const USERS_PATH = 'data/users.json';

/**
 * Fetch data/users.json from GitHub (using GitHub REST API or fallback to raw content)
 * @returns {Promise<{ users: object, sha: string|null }|null>}
 */
async function fetchUsersFromGithub() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const repo = process.env.GITHUB_REPO || GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || GITHUB_BRANCH;

  try {
    const headers = {
      'User-Agent': 'chat-file-share-app',
      'Accept': 'application/vnd.github+json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const apiUrl = `https://api.github.com/repos/${repo}/contents/${USERS_PATH}?ref=${branch}`;
    const res = await fetch(apiUrl, {
      headers,
      cache: 'no-store'
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.content) {
        const rawText = Buffer.from(data.content, 'base64').toString('utf8');
        const parsed = JSON.parse(rawText);
        return { users: parsed, sha: data.sha };
      }
    } else if (res.status === 404) {
      console.warn(`[GitHub Sync] ${USERS_PATH} not found in repository ${repo}`);
      return { users: {}, sha: null };
    } else {
      console.warn(`[GitHub Sync] GitHub API responded with status ${res.status}`);
    }
  } catch (err) {
    console.warn('[GitHub Sync] Error fetching via GitHub API, trying raw URL:', err.message);
  }

  // Fallback to raw githubusercontent if API rate limit or error
  try {
    const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${USERS_PATH}`;
    const rawRes = await fetch(rawUrl, { cache: 'no-store' });
    if (rawRes.ok) {
      const text = await rawRes.text();
      return { users: JSON.parse(text), sha: null };
    }
  } catch (err) {
    console.error('[GitHub Sync] Raw fallback fetch failed:', err.message);
  }

  return null;
}

/**
 * Commit updated data/users.json to GitHub repository
 * @param {string} username - Registered username
 * @param {object} userData - User record (passwordHash, createdAt, isAdmin, etc.)
 * @param {number} maxRetries - Retry attempts in case of SHA concurrency conflict
 * @returns {Promise<boolean>}
 */
async function syncUserToGithub(username, userData, maxRetries = 2) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const repo = process.env.GITHUB_REPO || GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || GITHUB_BRANCH;

  if (!token) {
    console.log('[GitHub Sync] GITHUB_TOKEN is not set in environment variables. Set GITHUB_TOKEN on Vercel to automatically commit new users to GitHub.');
    return false;
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // 1. Fetch current users.json and current file SHA from GitHub
      const current = await fetchUsersFromGithub();
      const users = (current && current.users) ? { ...current.users } : {};
      const currentSha = current ? current.sha : null;

      // 2. Add or update the user entry
      users[username] = { ...(users[username] || {}), ...userData };

      const updatedJson = JSON.stringify(users, null, 2) + '\n';
      const base64Content = Buffer.from(updatedJson, 'utf8').toString('base64');

      const bodyPayload = {
        message: `Add/update user "${username}" in data/users.json [skip ci]`,
        content: base64Content,
        branch
      };
      if (currentSha) {
        bodyPayload.sha = currentSha;
      }

      const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${USERS_PATH}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'chat-file-share-app'
        },
        body: JSON.stringify(bodyPayload)
      });

      if (putRes.ok) {
        console.log(`[GitHub Sync] Successfully committed new user "${username}" to GitHub (${repo}@${branch})!`);
        return true;
      }

      // Handle concurrency conflict (409) where SHA was updated by another request
      if (putRes.status === 409 && attempt < maxRetries) {
        console.warn(`[GitHub Sync] Conflict 409 updating ${USERS_PATH}, retrying in 1s...`);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      const errText = await putRes.text();
      console.error(`[GitHub Sync] Failed to commit to GitHub (status ${putRes.status}):`, errText);
      return false;
    } catch (err) {
      console.error(`[GitHub Sync] Error syncing user "${username}" to GitHub:`, err.message);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  return false;
}

/**
 * Remove a user from data/users.json on GitHub
 * @param {string} username - Deleted username
 * @returns {Promise<boolean>}
 */
async function syncDeleteUserFromGithub(username, maxRetries = 2) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const repo = process.env.GITHUB_REPO || GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || GITHUB_BRANCH;

  if (!token) return false;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const current = await fetchUsersFromGithub();
      if (!current || !current.users || !current.users[username]) {
        return false;
      }

      const users = { ...current.users };
      delete users[username];

      const updatedJson = JSON.stringify(users, null, 2) + '\n';
      const base64Content = Buffer.from(updatedJson, 'utf8').toString('base64');

      const bodyPayload = {
        message: `Remove user "${username}" from data/users.json [skip ci]`,
        content: base64Content,
        branch
      };
      if (current.sha) {
        bodyPayload.sha = current.sha;
      }

      const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${USERS_PATH}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'chat-file-share-app'
        },
        body: JSON.stringify(bodyPayload)
      });

      if (putRes.ok) {
        console.log(`[GitHub Sync] Successfully removed user "${username}" from GitHub repository!`);
        return true;
      }

      if (putRes.status === 409 && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      return false;
    } catch (err) {
      console.error(`[GitHub Sync] Error deleting user "${username}" from GitHub:`, err.message);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  return false;
}

module.exports = {
  fetchUsersFromGithub,
  syncUserToGithub,
  syncDeleteUserFromGithub
};
