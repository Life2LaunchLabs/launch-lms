"""Signing Open Badges 3.0 credentials, and the revocation status lists that go with them.

Each organization that issues badges gets an Ed25519 key on its first award. Its
public half is published in a ``did:web`` document on the API host, under the
organization's issuer URL, so ``did:web:<host>:api:v1:badge-awards:issuer:<org_uuid>``
resolves to ``https://<host>/api/v1/badge-awards/issuer/<org_uuid>/did.json``. The
private half is encrypted with ``LAUNCHLMS_CREDENTIAL_KEY`` (falling back to the JWT
secret when it isn't set); losing that key stops new signatures, but credentials
already issued keep verifying because the public keys stay published.

Credentials carry a Data Integrity proof with the ``eddsa-rdfc-2022`` cryptosuite:
the proof options and the credential are each canonicalized (RDFC-1.0) and hashed,
and the two hashes are signed. JSON-LD contexts are read from local copies, never
fetched. Each award also has a slot in its organization's BitstringStatusList;
revoking it sets the bit.
"""

from __future__ import annotations

import base64
import gzip
import hashlib
import json
import logging
import os
from datetime import datetime, timezone
from functools import cache
from pathlib import Path
from urllib.parse import quote, urlparse

from cryptography.fernet import Fernet, InvalidToken
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import Encoding, NoEncryption, PrivateFormat, PublicFormat
from pyld import jsonld
from sqlmodel import Session, func, select

from config.config import get_launchlms_config
from src.db.badges import AwardStatus, BadgeAward, OrgSigningKey
from src.db.organizations import Organization
from src.services.oauth.config import issuer

logger = logging.getLogger(__name__)

CONTEXTS_DIR = Path(__file__).parent / "contexts"
CONTEXT_FILES = {
    "https://www.w3.org/ns/credentials/v2": "credentials-v2.json",
    "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json": "ob-v3p0-3.0.3.json",
    "https://w3id.org/security/multikey/v1": "multikey-v1.json",
    "https://www.w3.org/ns/did/v1": "did-v1.json",
}
CRYPTOSUITE = "eddsa-rdfc-2022"
# The smallest list the spec allows (16KB), so a list doesn't reveal how many awards an organization made.
STATUS_LIST_BITS = 131072
ED25519_MULTICODEC = b"\xed\x01"
B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


# Encoding -----------------------------------------------------------------------

def b58encode(data: bytes) -> str:
    number = int.from_bytes(data, "big")
    out = ""
    while number:
        number, rest = divmod(number, 58)
        out = B58[rest] + out
    return "1" * (len(data) - len(data.lstrip(b"\0"))) + out


def b58decode(value: str) -> bytes:
    number = 0
    for char in value:
        number = number * 58 + B58.index(char)
    body = number.to_bytes((number.bit_length() + 7) // 8, "big") if number else b""
    return b"\0" * (len(value) - len(value.lstrip("1"))) + body


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


# Canonicalization -----------------------------------------------------------------

@cache
def _context(url: str) -> dict:
    return json.loads((CONTEXTS_DIR / CONTEXT_FILES[url]).read_text())


def _load(url: str, options=None) -> dict:
    if url not in CONTEXT_FILES:
        raise jsonld.JsonLdError(f"Context {url} is not available offline", "jsonld.LoadDocumentError", code="loading document failed")
    return {"contentType": "application/ld+json", "contextUrl": None, "documentUrl": url, "document": _context(url)}


def canonical(document: dict) -> str:
    """The document's RDFC-1.0 canonical N-Quads."""
    return jsonld.normalize(document, {"algorithm": "URDNA2015", "format": "application/n-quads", "documentLoader": _load, "safe": True})


def _hash_data(document: dict, proof: dict) -> bytes:
    unsigned = {key: value for key, value in document.items() if key != "proof"}
    options = {**{key: value for key, value in proof.items() if key != "proofValue"}, "@context": document["@context"]}
    return hashlib.sha256(canonical(options).encode()).digest() + hashlib.sha256(canonical(unsigned).encode()).digest()


# Keys --------------------------------------------------------------------------------

def _cipher() -> Fernet:
    secret = os.environ.get("LAUNCHLMS_CREDENTIAL_KEY") or get_launchlms_config().security_config.auth_jwt_secret_key
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(f"launchlms:credential-signing:{secret}".encode()).digest()))


def did(org: Organization) -> str:
    host = urlparse(issuer()).netloc
    return f"did:web:{quote(host, safe='')}:api:v1:badge-awards:issuer:{org.org_uuid}"


def key_id(org: Organization) -> str:
    return f"{did(org)}#key-1"


def _public_multibase(public: Ed25519PublicKey) -> str:
    return "z" + b58encode(ED25519_MULTICODEC + public.public_bytes(Encoding.Raw, PublicFormat.Raw))


def public_key(multibase: str) -> Ed25519PublicKey:
    raw = b58decode(multibase[1:])
    if not multibase.startswith("z") or raw[:2] != ED25519_MULTICODEC:
        raise ValueError("Not an Ed25519 Multikey")
    return Ed25519PublicKey.from_public_bytes(raw[2:])


def signing_key(db: Session, org: Organization) -> OrgSigningKey:
    """The organization's key, made on first use (flushed, not committed)."""
    row = db.exec(select(OrgSigningKey).where(OrgSigningKey.org_id == org.id)).first()
    if row is None:
        private = Ed25519PrivateKey.generate()
        raw = private.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption())
        row = OrgSigningKey(org_id=int(org.id), public_key_multibase=_public_multibase(private.public_key()),  # type: ignore[arg-type]
                            private_key_encrypted=_cipher().encrypt(raw).decode(), creation_date=datetime.now().isoformat())
        db.add(row)
        db.flush()
    return row


def _private(row: OrgSigningKey) -> Ed25519PrivateKey:
    try:
        return Ed25519PrivateKey.from_private_bytes(_cipher().decrypt(row.private_key_encrypted.encode()))
    except InvalidToken as error:
        logger.error("The credential signing key for org %s could not be decrypted", row.org_id)
        raise RuntimeError("This organization's signing key is unreadable: LAUNCHLMS_CREDENTIAL_KEY changed.") from error


def did_document(db: Session, org: Organization) -> dict:
    """The organization's DID document: its public key, for verifying what it signed."""
    row = db.exec(select(OrgSigningKey).where(OrgSigningKey.org_id == org.id)).first()
    methods = [{"id": key_id(org), "type": "Multikey", "controller": did(org), "publicKeyMultibase": row.public_key_multibase}] if row else []
    return {
        "@context": ["https://www.w3.org/ns/did/v1", "https://w3id.org/security/multikey/v1"],
        "id": did(org),
        "verificationMethod": methods,
        "assertionMethod": [method["id"] for method in methods],
    }


# Proofs -------------------------------------------------------------------------------

def sign(db: Session, document: dict, org: Organization) -> dict:
    """The document with a Data Integrity proof by the organization's key."""
    row = signing_key(db, org)
    proof = {"type": "DataIntegrityProof", "cryptosuite": CRYPTOSUITE, "created": _now(), "verificationMethod": key_id(org), "proofPurpose": "assertionMethod"}
    signature = _private(row).sign(_hash_data(document, proof))
    return {**document, "proof": {**proof, "proofValue": "z" + b58encode(signature)}}


def verify(db: Session, document: dict) -> bool:
    """Whether the document's proof checks out against the key its verification method names (one of ours)."""
    proof = document.get("proof")
    if not isinstance(proof, dict) or proof.get("cryptosuite") != CRYPTOSUITE or not str(proof.get("proofValue", "")).startswith("z"):
        return False
    method = str(proof.get("verificationMethod") or "")
    org_uuid = method.split("#")[0].rsplit(":", 1)[-1]
    org = db.exec(select(Organization).where(Organization.org_uuid == org_uuid)).first()
    row = db.exec(select(OrgSigningKey).where(OrgSigningKey.org_id == org.id)).first() if org else None
    if row is None or method != key_id(org):  # type: ignore[arg-type]
        return False
    try:
        public_key(row.public_key_multibase).verify(b58decode(proof["proofValue"][1:]), _hash_data(document, proof))
    except (InvalidSignature, ValueError):
        return False
    return True


# Status lists -----------------------------------------------------------------------

def status_list_url(org: Organization) -> str:
    return f"{issuer()}/api/v1/badge-awards/status/{org.org_uuid}"


def next_status_index(db: Session, org_id: int) -> int:
    last = db.exec(select(func.max(BadgeAward.status_list_index)).where(BadgeAward.issuing_org_id == org_id)).one()
    return 0 if last is None else int(last) + 1


def status_entry(org: Organization, index: int) -> dict:
    url = status_list_url(org)
    return {"id": f"{url}#{index}", "type": "BitstringStatusListEntry", "statusPurpose": "revocation",
            "statusListIndex": str(index), "statusListCredential": url}


def encoded_list(revoked: list[int]) -> str:
    """Multibase base64url of the GZIP'd bitstring; index 0 is the first byte's highest bit."""
    size = max(STATUS_LIST_BITS, (max(revoked, default=0) // 8 + 1) * 8)
    bits = bytearray(size // 8)
    for index in revoked:
        bits[index // 8] |= 0x80 >> (index % 8)
    return "u" + base64.urlsafe_b64encode(gzip.compress(bytes(bits), mtime=0)).decode().rstrip("=")


def is_set(encoded: str, index: int) -> bool:
    data = gzip.decompress(base64.urlsafe_b64decode(encoded[1:] + "=" * (-len(encoded[1:]) % 4)))
    return bool(data[index // 8] & (0x80 >> (index % 8))) if index // 8 < len(data) else False


def status_list(db: Session, org: Organization) -> dict:
    """The organization's revocation list as a signed BitstringStatusListCredential."""
    revoked = [int(index) for index in db.exec(select(BadgeAward.status_list_index).where(
        BadgeAward.issuing_org_id == org.id, BadgeAward.status == AwardStatus.REVOKED.value, BadgeAward.status_list_index.is_not(None),  # type: ignore[union-attr]
    )).all()]
    url = status_list_url(org)
    document = {
        "@context": ["https://www.w3.org/ns/credentials/v2"],
        "id": url,
        "type": ["VerifiableCredential", "BitstringStatusListCredential"],
        "issuer": did(org),
        "validFrom": _now(),
        "credentialSubject": {"id": f"{url}#list", "type": "BitstringStatusList", "statusPurpose": "revocation", "encodedList": encoded_list(revoked)},
    }
    return sign(db, document, org)
