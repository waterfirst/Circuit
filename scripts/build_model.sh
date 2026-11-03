#!/usr/bin/env bash
# Compile the TFT model with the local OpenVAF and install it for the server.
# The OSDI binary depends on the OpenVAF/ngspice build, so always rebuild on a new machine.
set -euo pipefail
cd "$(dirname "$0")/.."
OPENVAF="${OPENVAF:-openvaf}"
"$OPENVAF" models/ptft_fit.va -o server/ptft_fit.osdi
echo "built server/ptft_fit.osdi with $("$OPENVAF" --version 2>&1 | head -1)"
