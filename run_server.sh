#!/usr/bin/env bash
set -euo pipefail

find_free_port() {
	local port="$1"
	while ss -ltn "( sport = :${port} )" | grep -q ":${port}"; do
		port=$((port + 1))
	done
	echo "$port"
}

server_port="$(find_free_port "${JEKYLL_PORT:-4000}")"
host="${JEKYLL_HOST:-127.0.0.1}"
livereload_enabled="${JEKYLL_LIVERELOAD:-0}"

if [[ "${livereload_enabled}" == "1" ]]; then
	reload_port="$(find_free_port "${JEKYLL_RELOAD_PORT:-35729}")"
	echo "Starting Jekyll serve on ${host}:${server_port} (LiveReload: ${reload_port})"
	bundle exec jekyll serve -H "${host}" -P "${server_port}" -l --livereload-port "${reload_port}"
else
	echo "Starting Jekyll serve on ${host}:${server_port}"
	bundle exec jekyll serve -H "${host}" -P "${server_port}"
fi