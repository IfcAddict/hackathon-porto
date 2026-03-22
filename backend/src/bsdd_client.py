"""buildingSMART Data Dictionary (bSDD) HTTP client.

REST (Dictionary, Class): https://api.bsdd.buildingsmart.org — no auth for read-only
calls from a desktop client per bSDD API documentation.

GraphQL (class + properties + allowedValues): optional endpoint; the public test
GraphQL URL is suitable for development. Production GraphQL is secured — see
https://github.com/buildingSMART/bSDD/blob/master/Documentation/bSDD%20API.md
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from urllib.parse import quote

log = logging.getLogger("ifc_agent.bsdd")

USER_AGENT = "hackathon-porto-ifc-agent/1.0"
DEFAULT_TIMEOUT_SEC = 55

DEFAULT_IFC_43_DICTIONARY_URI = "https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3"
DEFAULT_REST_BASE = "https://api.bsdd.buildingsmart.org"
DEFAULT_GRAPHQL_URL = "https://test.bsdd.buildingsmart.org/graphql/"

_GQL_CLASS_DETAIL = """
query ($dictionaryUri: String!, $classUri: String!) {
  dictionary(uri: $dictionaryUri) {
    name
    uri
    version
    class(uri: $classUri, includeChildren: false) {
      classType
      code
      name
      uri
      definition
      synonyms
      relatedIfcEntityNames
      status
      properties {
        code
        name
        uri
        description
        definition
        dataType
        pattern
        example
        dimension
        physicalQuantity
        isRequired
        allowedValues {
          code
          value
        }
      }
    }
  }
}
"""

_GQL_CLASS_SEARCH = """
query ($dictionaryUri: String!, $searchText: String!, $languageCode: String!) {
  dictionary(uri: $dictionaryUri) {
    name
    uri
    version
    classSearch(searchText: $searchText, languageCode: $languageCode) {
      classType
      code
      name
      uri
      definition
      synonyms
      relatedIfcEntityNames
      status
      properties {
        code
        name
        uri
        dataType
        allowedValues {
          code
          value
        }
      }
    }
  }
}
"""


def _request_json(
    url: str,
    *,
    method: str = "GET",
    data: bytes | None = None,
    extra_headers: dict[str, str] | None = None,
    timeout: float = DEFAULT_TIMEOUT_SEC,
) -> dict | list:
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:2000]
        log.warning("bSDD HTTP %s %s: %s", e.code, url, body)
        raise RuntimeError(f"bSDD HTTP {e.code} for {url}: {body}") from e
    except urllib.error.URLError as e:
        log.warning("bSDD URL error %s: %s", url, e)
        raise RuntimeError(f"bSDD request failed for {url}: {e}") from e


def rest_list_dictionaries(rest_base: str) -> list[dict]:
    url = rest_base.rstrip("/") + "/api/Dictionary/v1"
    data = _request_json(url)
    if isinstance(data, dict) and isinstance(data.get("dictionaries"), list):
        return data["dictionaries"]
    if isinstance(data, list):
        return data
    return []


def rest_get_class(rest_base: str, class_uri: str) -> dict:
    url = rest_base.rstrip("/") + "/api/Class/v1?uri=" + quote(class_uri, safe="")
    data = _request_json(url)
    if not isinstance(data, dict):
        raise RuntimeError("Unexpected Class API response shape")
    return data


def graphql_post(graphql_url: str, query: str, variables: dict) -> dict:
    payload = json.dumps({"query": query, "variables": variables}).encode("utf-8")
    url = graphql_url if graphql_url.endswith("/") else graphql_url.rstrip("/") + "/"
    data = _request_json(
        url,
        method="POST",
        data=payload,
        extra_headers={"Content-Type": "application/json"},
    )
    if not isinstance(data, dict):
        raise RuntimeError("Unexpected GraphQL response shape")
    if data.get("errors"):
        msgs = "; ".join(
            str(err.get("message", err))
            for err in data["errors"]
        )
        raise RuntimeError(f"bSDD GraphQL errors: {msgs}")
    return data


def class_uri_from_reference(dictionary_uri: str, reference_code: str) -> str:
    base = dictionary_uri.rstrip("/")
    code = reference_code.strip()
    return f"{base}/class/{code}"


def graphql_class_detail(
    graphql_url: str,
    *,
    dictionary_uri: str,
    class_uri: str,
) -> dict:
    raw = graphql_post(
        graphql_url,
        _GQL_CLASS_DETAIL,
        {"dictionaryUri": dictionary_uri, "classUri": class_uri},
    )
    return raw.get("data") or {}


def graphql_class_search(
    graphql_url: str,
    *,
    dictionary_uri: str,
    search_text: str,
    language_code: str,
    offset: int,
    limit: int,
) -> dict:
    """Run classSearch; server returns full match list (no GraphQL pagination args).

    We slice client-side into [offset : offset+limit] and attach ``_pagination`` metadata.
    Each call re-downloads the full result set from the API — prefer ``class_reference_code``
    when the code is known.
    """
    raw = graphql_post(
        graphql_url,
        _GQL_CLASS_SEARCH,
        {
            "dictionaryUri": dictionary_uri,
            "searchText": search_text,
            "languageCode": language_code,
        },
    )
    data = raw.get("data") or {}
    dictionary = (data.get("dictionary") or {}) if isinstance(data, dict) else {}
    classes = dictionary.get("classSearch")
    if not isinstance(classes, list):
        return data

    total = len(classes)
    o = max(0, int(offset))
    lim = max(1, int(limit))
    window = classes[o : o + lim]
    dictionary = {
        **dictionary,
        "classSearch": window,
        "_pagination": {
            "offset": o,
            "limit": lim,
            "returned": len(window),
            "total_in_response": total,
            "has_more": o + len(window) < total,
        },
    }
    return {**data, "dictionary": dictionary}
