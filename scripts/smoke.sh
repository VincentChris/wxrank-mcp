#!/usr/bin/env bash

set -u

BASE_URL="${WXRANK_BASE_URL:-http://data.wxrank.com}"
KEY="${WXRANK_API_KEY:-${WXRANK_KEY:-}}"
WXID="${WXRANK_WXID:-gh_3037fb937d57}"
KEYWORD_ACCOUNT="${WXRANK_KEYWORD_ACCOUNT:-派代跨境}"
KEYWORD_ARTICLE="${WXRANK_KEYWORD_ARTICLE:-跨境}"
MONTH="${WXRANK_ARTLIST_MONTH:-$(date +%Y%m)}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      ;;
    --key)
      KEY="$2"
      shift 2
      ;;
    --wxid)
      WXID="$2"
      shift 2
      ;;
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --month)
      MONTH="$2"
      shift 2
      ;;
    *)
      echo "未知参数: $1"
      echo "用法: bash scripts/smoke.sh [--key <KEY>] [--wxid <WXID>] [--base-url <URL>] [--month <YYYYMM>]"
      exit 1
      ;;
  esac
done

if [[ -z "${KEY}" ]]; then
  echo "缺少 key。请通过 --key 传入，或设置环境变量 WXRANK_API_KEY/WXRANK_KEY。"
  exit 1
fi

sanitize_json() {
  LC_ALL=C tr -d '\000-\010\013\014\016-\037'
}

json_get() {
  local payload="$1"
  local expr="$2"
  printf '%s' "${payload}" | sanitize_json | jq -r "${expr}" 2>/dev/null
}

api_get() {
  local endpoint="$1"
  local query_key="$2"
  local query_val="$3"
  curl -sS --http1.1 "${BASE_URL}${endpoint}" --get --data-urlencode "${query_key}=${query_val}"
}

api_post() {
  local endpoint="$1"
  local body="$2"
  curl -sS --http1.1 "${BASE_URL}${endpoint}" -H 'Content-Type: application/json' --data "${body}"
}

PASS=0
FAIL=0
SKIP=0

record() {
  local name="$1"
  local payload="$2"

  local code
  code="$(json_get "${payload}" '.code // empty')"
  local msg
  msg="$(json_get "${payload}" '.msg // ""')"

  if [[ "${code}" == "0" ]]; then
    PASS=$((PASS + 1))
    printf '%-22s %-5s code=%s %s\n' "${name}" "PASS" "${code}" "${msg}"
  elif [[ -z "${code}" ]]; then
    FAIL=$((FAIL + 1))
    printf '%-22s %-5s code=? %s\n' "${name}" "FAIL" "响应解析失败"
  else
    FAIL=$((FAIL + 1))
    printf '%-22s %-5s code=%s %s\n' "${name}" "FAIL" "${code}" "${msg}"
  fi
}

record_skip() {
  local name="$1"
  local reason="$2"
  SKIP=$((SKIP + 1))
  printf '%-22s %-5s %s\n' "${name}" "SKIP" "${reason}"
}

echo "== wxrank smoke start =="
echo "base_url: ${BASE_URL}"
echo "wxid: ${WXID}"
echo "month: ${MONTH}"
echo

score_before="$(api_get '/weixin/score' 'key' "${KEY}")"
record "score_before" "${score_before}"

getps_payload="$(printf '{"key":"%s","wxid":"%s"}' "${KEY}" "${WXID}")"
getps="$(api_post '/weixin/getps' "${getps_payload}")"
record "getps" "${getps}"

article_url="$(json_get "${getps}" '.data.list[0].art_url // empty')"
if [[ -z "${article_url}" ]]; then
  echo
  echo "无法从 getps 响应提取 article_url，后续依赖项跳过。"
fi

if [[ -n "${article_url}" ]]; then
  artinfo_payload="$(printf '{"key":"%s","url":"%s"}' "${KEY}" "${article_url}")"
  artinfo="$(api_post '/weixin/artinfo' "${artinfo_payload}")"
  record "artinfo" "${artinfo}"

  biz="$(json_get "${artinfo}" '.data.biz // empty')"
  comment_id="$(json_get "${artinfo}" '.data.comment_id // empty')"

  getrk_payload="$(printf '{"key":"%s","url":"%s"}' "${KEY}" "${article_url}")"
  getrk="$(api_post '/weixin/getrk' "${getrk_payload}")"
  record "getrk" "${getrk}"

  artdata_payload="$(printf '{"key":"%s","url":"%s"}' "${KEY}" "${article_url}")"
  artdata="$(api_post '/weixin/artdata' "${artdata_payload}")"
  record "artdata" "${artdata}"
else
  record_skip "artinfo" "缺少 article_url"
  record_skip "getrk" "缺少 article_url"
  record_skip "artdata" "缺少 article_url"
  biz=""
  comment_id=""
fi

getsu_payload="$(printf '{"key":"%s","keyword":"%s","page":1}' "${KEY}" "${KEYWORD_ACCOUNT}")"
getsu="$(api_post '/weixin/getsu' "${getsu_payload}")"
record "getsu" "${getsu}"

getso_payload="$(printf '{"key":"%s","keyword":"%s","sort_type":2,"page":1}' "${KEY}" "${KEYWORD_ARTICLE}")"
getso="$(api_post '/weixin/getso' "${getso_payload}")"
record "getso" "${getso}"

if [[ -n "${comment_id}" ]]; then
  getcm_payload="$(printf '{"key":"%s","comment_id":"%s"}' "${KEY}" "${comment_id}")"
  getcm="$(api_post '/weixin/getcm' "${getcm_payload}")"
  record "getcm" "${getcm}"
else
  record_skip "getcm" "缺少 comment_id"
fi

if [[ -n "${biz}" ]]; then
  getinfo_payload="$(printf '{"key":"%s","biz":"%s"}' "${KEY}" "${biz}")"
  getinfo="$(api_post '/weixin/getinfo' "${getinfo_payload}")"
  record "getinfo" "${getinfo}"

  getbiz_payload="$(printf '{"key":"%s","biz":"%s"}' "${KEY}" "${biz}")"
  getbiz="$(api_post '/weixin/getbiz' "${getbiz_payload}")"
  record "getbiz" "${getbiz}"

  getpc_payload="$(printf '{"key":"%s","biz":"%s","begin":0}' "${KEY}" "${biz}")"
  getpc="$(api_post '/weixin/getpc' "${getpc_payload}")"
  record "getpc" "${getpc}"
else
  record_skip "getinfo" "缺少 biz"
  record_skip "getbiz" "缺少 biz"
  record_skip "getpc" "缺少 biz"
fi

artlist_payload="$(printf '{"key":"%s","month":"%s"}' "${KEY}" "${MONTH}")"
artlist="$(api_post '/weixin/artlist' "${artlist_payload}")"
record "artlist" "${artlist}"

score_after="$(api_get '/weixin/score' 'key' "${KEY}")"
record "score_after" "${score_after}"

echo
echo "== summary =="
echo "PASS=${PASS} FAIL=${FAIL} SKIP=${SKIP}"
echo "article_url=${article_url:-N/A}"
echo "biz=${biz:-N/A}"
echo "comment_id=${comment_id:-N/A}"
echo "score_before=$(json_get "${score_before}" '.msg // "N/A"')"
echo "score_after=$(json_get "${score_after}" '.msg // "N/A"')"

if [[ "${FAIL}" -gt 0 ]]; then
  exit 2
fi
