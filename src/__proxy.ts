import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { Database } from "types/supabase";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function proxy(req: NextRequest) {

  let res = NextResponse.next({ request: req });
  console.log("cookies",req);
    // 2. Create the Supabase client configured for the middleware (server-side context).
    const supabase = createServerClient<Database>(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              res.cookies.set(name, value, options);
            });
          },
        },
      }
    );
  
    const {
      data: { session }, error
    } = await supabase.auth.getSession();
    console.log(session,error);
    if (!session || !session.user) {
   
  const token = req.cookies.get('supabase-auth-token');
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "";
    console.log("no session, redirect to ''",req);
    const redirectRes = NextResponse.redirect(url);
    res.cookies.getAll().forEach(({ name, value, ...options }) => {
      redirectRes.cookies.set(name, value, options);
    });
    return redirectRes;
  }

  return res;
}

export const config = {
  matcher: ["/settings", "/data/:path*"],
};
