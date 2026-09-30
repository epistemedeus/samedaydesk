/* Owner-QA contribution: compact the existing correspondence MCP envelope.
 * No libc, allocator, WASI, or runtime imports. Host supplies valid bounded JSON.
 * Retain payload, explicit errors and unknown write outcomes; text is not authority.
 */
typedef unsigned int u32;
typedef unsigned long long u64;
static char input[16384], output[32768];
static const char *s; static u32 n, pos;
static void ws(void) { while(pos<n && (s[pos]==' '||s[pos]=='\n'||s[pos]=='\r'||s[pos]=='\t')) pos++; }
static void string(void) {
  pos++;
  while(pos<n) { char c=s[pos++]; if(c=='"') break; if(c=='\\' && pos<n) pos++; }
}
static void value(void) {
  ws(); if(pos>=n) return;
  if(s[pos]=='"') {string();return;}
  if(s[pos]=='{'||s[pos]=='[') {
    char end=s[pos++]=='{'?'}':']'; ws();
    while(pos<n && s[pos]!=end) {
      if(s[pos]==','||s[pos]==':') pos++; else value(); ws();
    }
    if(pos<n) pos++; return;
  }
  while(pos<n && s[pos]!=',' && s[pos]!=']' && s[pos]!='}' && s[pos]!=' ' && s[pos]!='\n' && s[pos]!='\t' && s[pos]!='\r') pos++;
}
static int eq(u32 start,u32 end,const char *word) {
  u32 i=0; while(word[i] && start+i<end && s[start+i]==word[i]) i++;
  return start+i==end && word[i]==0;
}
static int field(u32 start,const char *name,u32 *a,u32 *b) {
  pos=start;ws(); if(pos>=n||s[pos++]!='{') return 0; ws();
  while(pos<n && s[pos]!='}') {
    u32 k=pos; string();u32 end=pos;ws();pos++;ws();u32 v=pos;value();u32 e=pos;
    if(eq(k+1,end-1,name)){*a=v;*b=e;return 1;}
    ws();if(pos<n&&s[pos]==',')pos++;ws();
  }
  return 0;
}
static u32 append(u32 at,const char *v) {while(*v && at<sizeof(output))output[at++]=*v++;return at;}
__attribute__((export_name("alloc"))) u32 alloc(u32 length) {return length<=sizeof(input)?(u32)input:0xffffffff;}
__attribute__((export_name("transform"))) u64 transform(u32 pointer,u32 length) {
  s=(const char *)pointer;n=length;u32 a=0,b=0,c=0,d=0,p=0;
  const char *outcome="unsupported";
  int found=field(0,"structuredContent",&a,&b) && s[a]=='{';
  if(found) {
    outcome="observed";
    if(field(0,"isError",&c,&d) && eq(c,d,"true")) outcome="error";
    if(field(a,"error",&c,&d) && field(c,"code",&c,&d) && eq(c,d,"\"unknown_outcome\"")) outcome="unknown";
  }
  p=append(p,"{\"outcome\":\"");p=append(p,outcome);p=append(p,"\",\"payload\":");
  if(found) {for(u32 i=a;i<b && p<sizeof(output)-1;i++)output[p++]=s[i];}
  else p=append(p,"{}");
  p=append(p,"}");return ((u64)p<<32)|(u32)output;
}
