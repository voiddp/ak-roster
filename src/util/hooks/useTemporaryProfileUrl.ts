import { useRouter } from "next/router";
import { useEffect, useRef } from "react";
import { GetServerSidePropsContext } from "next";

export interface TempUrlData {
  originalPath: string;
  username: string;
  tabNumber: number;
}

const VALID_REDIRECT_PATHS = [
  "/data/profile",
  "/data/view",
  "/data/input"
] as const;

function shouldRedirectToOriginal(tempUrlData: TempUrlData | null, currentUsername: string, currentTabNumber: number) {
  return Boolean(
    tempUrlData &&
    tempUrlData.username &&
    tempUrlData.tabNumber === currentTabNumber &&
    currentUsername.toLowerCase() === tempUrlData.username.toLowerCase()
  );
}

export function handleTempUrlRedirect(context: GetServerSidePropsContext, username: string) {
  // Extract tab number from URL path (format: /u/username/tabNumber)
  const pathParts = context.params?.user as string[] | undefined;

  if (!pathParts || pathParts.length < 2) {
    return null; // Not a numbered temp URL format
  }

  const urlUsername = pathParts[0];
  const urlTabNumber = parseInt(pathParts[1]);

  // Validate URL format
  if (urlUsername.toLowerCase() !== username.toLowerCase() || isNaN(urlTabNumber)) {
    return null;
  }

  // Get all active temp cookies
  const activeCookies = getActiveTempCookies(context);

  // Find the cookie that matches this tab number
  const matchingCookie = activeCookies.find(cookie => cookie.number === urlTabNumber);

  // Check if we should redirect
  if (matchingCookie && shouldRedirectToOriginal(matchingCookie.data, username, urlTabNumber)) {
    // Clear this specific cookie
    deleteTempUrlCookie(urlTabNumber, context);

    const destination = VALID_REDIRECT_PATHS.includes(matchingCookie.data.originalPath as any)
      ? matchingCookie.data.originalPath
      : `/network/lookup/${username}`;

    return {
      redirect: {
        destination,
        permanent: false,
      },
    };
  }

  return {
    redirect: {
      destination: `/network/lookup/${username}`,
      permanent: false,
    },
  };
}

function setTempUrlCookie(tabNumber: number, data: TempUrlData, context?: GetServerSidePropsContext) {
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toUTCString(); // 24 hours
  const cookieName = `tempUrl_${tabNumber}`;
  const cookieValue = encodeURIComponent(JSON.stringify(data));
  const cookieString = `${cookieName}=${cookieValue}; expires=${expires}; path=/`;

  if (context) {
    // SSR context - set via response headers
    context.res.setHeader('Set-Cookie', cookieString);
  } else {
    // Client context
    document.cookie = cookieString;
  }
}

export function deleteTempUrlCookie(tabNumber: number, context?: GetServerSidePropsContext) {
  const cookieName = `tempUrl_${tabNumber}`;
  const cookieString = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;

  if (context) {
    context.res.setHeader('Set-Cookie', cookieString);
  } else {
    document.cookie = cookieString;
  }
}

function safeJsonParse<T>(jsonString: string): T | null {
  try {
    return JSON.parse(jsonString) as T;
  } catch {
    return null;
  }
}

export function getActiveTempCookies(context?: GetServerSidePropsContext): { number: number; data: TempUrlData }[] {
  const cookies: { number: number; data: TempUrlData }[] = [];
  const cookieSource = context
    ? context.req.headers.cookie
    : typeof document !== 'undefined'
      ? document.cookie : null;

  if (!cookieSource) return cookies;

  const cookiePairs = cookieSource.split(';');

  for (const pair of cookiePairs) {
    const [name, value] = pair.trim().split('=');

    // Check if it's a tempUrl cookie
    if (name.startsWith('tempUrl_')) {
      try {
        // Extract number from cookie name (tempUrl_1 -> 1)
        const number = parseInt(name.replace('tempUrl_', ''));

        if (!isNaN(number)) {
          // Parse the cookie value
          const data = safeJsonParse<TempUrlData>(decodeURIComponent(value));
          if (!data || typeof data !== 'object') {
            // Skip invalid cookie
            continue;
          }

          // Validate that the tabNumber matches the cookie number
          if (data.tabNumber === number) {
            cookies.push({ number, data });
          }
        }
      } catch (error) {
        console.warn(`Failed to parse tempUrl cookie ${name}:`, error);
        // Skip invalid cookies
      }
    }
  }

  return cookies;
}

function getNextAvailableTabNumber(): number {
  const activeCookies = getActiveTempCookies();
  const activeNumbers = activeCookies.map(c => c.number).sort((a, b) => a - b);

  // If no active cookies, start with 0
  console.log(activeCookies);
  if (activeNumbers.length === 0) {
    return 0;
  }

  // Find first gap in the sequence
  for (let i = 0; i <= activeNumbers[activeNumbers.length - 1] + 1; i++) {
    if (!activeNumbers.includes(i)) {
      return i;
    }
  }

  return activeNumbers[activeNumbers.length - 1] + 1;
}

function useTemporaryProfileUrl(username?: string | null) {
  const router = useRouter();
  const hasAppliedFakeUrl = useRef(false);
  const tabNumberRef = useRef<number | null>(null);

  useEffect(() => {
    if (!username || hasAppliedFakeUrl.current) return;

    const currentPath = router.asPath.split("?")[0];
    let tabNumberStr = sessionStorage.getItem('assignedTabNumber');

    if (!VALID_REDIRECT_PATHS.includes(currentPath as any)) {
      if (tabNumberStr) {
        deleteTempUrlCookie(Number(tabNumberStr));
        sessionStorage.removeItem('assignedTabNumber');
      }
      return;
    }
    let tabNumber: number = 0;
    if (!tabNumberStr) {
      tabNumber = getNextAvailableTabNumber();
      sessionStorage.setItem('assignedTabNumber', tabNumber.toString());
    } else {
      tabNumber = Number(tabNumberStr);
    }

    tabNumberRef.current = tabNumber;

    const fakePath = `/u/${username}/${tabNumber}`;
    setTempUrlCookie(tabNumber, { originalPath: currentPath, username, tabNumber });

    // Only apply once
    router.replace(router.asPath, fakePath, { shallow: true });
    hasAppliedFakeUrl.current = true;

    // Restore when navigating away
    const handleRouteChange = (url: string) => {
      if (!url.startsWith('/u/') && hasAppliedFakeUrl.current && tabNumberRef.current !== null) {
        deleteTempUrlCookie(tabNumberRef.current);
        hasAppliedFakeUrl.current = false;
      }
    };


    router.events.on('routeChangeStart', handleRouteChange);

    return () => {
      router.events.off('routeChangeStart', handleRouteChange);
    };
  }, [username, router, router.asPath]); // Only run when username or path changes
}

export default useTemporaryProfileUrl;