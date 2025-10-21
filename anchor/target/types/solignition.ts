/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/solignition.json`.
 */
export type Solignition = {
  "address": "4dWBvsjopo5Z145Xmse3Lx41G1GKpMyWMLc6p4a52T4N",
  "metadata": {
    "name": "solignition",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "docs": [
    "Solana Developer Lending Protocol",
    "",
    "This protocol enables SOL lending for developer program deployments with:",
    "- Trustless upgrade authority management",
    "- Automated loan recovery and repayment",
    "- Fair yield distribution to depositors",
    "- Secure fee collection and distribution",
    "",
    "Recovery Flow for Expired Loans:",
    "1. Call `recover_loan` when loan expires to mark it recovered",
    "2. Off-chain deployer can close the program account",
    "3. Call `return_reclaimed_sol` to return recovered SOL to vault"
  ],
  "instructions": [
    {
      "name": "deposit",
      "docs": [
        "Deposit SOL into the vault"
      ],
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "depositor",
          "writable": true,
          "signer": true
        },
        {
          "name": "depositorRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  112,
                  111,
                  115,
                  105,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "depositor"
              }
            ]
          }
        },
        {
          "name": "protocolConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initialize",
      "docs": [
        "Initialize the protocol with admin and configuration"
      ],
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocolConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "authorityPda",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "adminPda",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  100,
                  109,
                  105,
                  110
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "deployer"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "adminFeeSplitBps",
          "type": "u16"
        },
        {
          "name": "defaultInterestRateBps",
          "type": "u16"
        },
        {
          "name": "defaultAdminFeeBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "recoverLoan",
      "docs": [
        "Recover expired loan"
      ],
      "discriminator": [
        16,
        58,
        190,
        149,
        240,
        136,
        240,
        85
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "protocolConfig"
          ]
        },
        {
          "name": "protocolConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "loan",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  97,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "protocol_config.loan_counter",
                "account": "protocolConfig"
              },
              {
                "kind": "account",
                "path": "loan.borrower",
                "account": "loan"
              }
            ]
          }
        },
        {
          "name": "deployer",
          "signer": true
        },
        {
          "name": "adminPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  100,
                  109,
                  105,
                  110
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": []
    },
    {
      "name": "repayLoan",
      "discriminator": [
        224,
        93,
        144,
        77,
        61,
        17,
        137,
        54
      ],
      "accounts": [
        {
          "name": "borrower",
          "writable": true,
          "signer": true,
          "relations": [
            "loan"
          ]
        },
        {
          "name": "loan",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  97,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "loanId"
              },
              {
                "kind": "account",
                "path": "borrower"
              }
            ]
          }
        },
        {
          "name": "protocolConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "loanId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "requestLoan",
      "docs": [
        "Request a loan and pay upfront admin fee"
      ],
      "discriminator": [
        120,
        2,
        7,
        7,
        1,
        219,
        235,
        187
      ],
      "accounts": [
        {
          "name": "borrower",
          "writable": true,
          "signer": true
        },
        {
          "name": "loan",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  97,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "protocol_config.loan_counter",
                "account": "protocolConfig"
              },
              {
                "kind": "account",
                "path": "borrower"
              }
            ]
          }
        },
        {
          "name": "protocolConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "authorityPda",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "adminPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  100,
                  109,
                  105,
                  110
                ]
              }
            ]
          }
        },
        {
          "name": "deployer",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "principal",
          "type": "u64"
        },
        {
          "name": "duration",
          "type": "i64"
        },
        {
          "name": "interestRateBps",
          "type": "u16"
        },
        {
          "name": "adminFeeBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "returnReclaimedSol",
      "docs": [
        "Return reclaimed SOL from expired/recovered loans back to vault"
      ],
      "discriminator": [
        220,
        56,
        188,
        60,
        115,
        212,
        233,
        113
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "protocolConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "loan",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  97,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "protocol_config.loan_counter",
                "account": "protocolConfig"
              },
              {
                "kind": "account",
                "path": "loan.borrower",
                "account": "loan"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "deployerPda",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setDeployedProgram",
      "docs": [
        "Set the deployed program pubkey after off-chain deployment"
      ],
      "discriminator": [
        172,
        130,
        250,
        99,
        100,
        127,
        91,
        77
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "protocolConfig"
          ]
        },
        {
          "name": "protocolConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "loan",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  97,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "loanId"
              },
              {
                "kind": "account",
                "path": "loan.borrower",
                "account": "loan"
              }
            ]
          }
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "loanId",
          "type": "u64"
        },
        {
          "name": "programPubkey",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setPaused",
      "docs": [
        "Admin function to pause/unpause protocol"
      ],
      "discriminator": [
        91,
        60,
        125,
        192,
        176,
        225,
        166,
        218
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "protocolConfig"
          ]
        },
        {
          "name": "protocolConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "isPaused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "transferAuthorityToBorrower",
      "discriminator": [
        159,
        89,
        124,
        24,
        191,
        80,
        144,
        187
      ],
      "accounts": [
        {
          "name": "deployer",
          "signer": true
        },
        {
          "name": "protocolConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "loan",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  97,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "loanId"
              },
              {
                "kind": "account",
                "path": "loan.borrower",
                "account": "loan"
              }
            ]
          }
        },
        {
          "name": "borrower",
          "writable": true
        },
        {
          "name": "programData",
          "writable": true
        },
        {
          "name": "bpfUpgradeableLoader",
          "address": "BPFLoaderUpgradeab1e11111111111111111111111"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "loanId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "updateConfig",
      "docs": [
        "Admin function to update configuration"
      ],
      "discriminator": [
        29,
        158,
        252,
        191,
        10,
        83,
        219,
        99
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "protocolConfig"
          ]
        },
        {
          "name": "protocolConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "adminFeeSplitBps",
          "type": {
            "option": "u16"
          }
        },
        {
          "name": "defaultInterestRateBps",
          "type": {
            "option": "u16"
          }
        },
        {
          "name": "defaultAdminFeeBps",
          "type": {
            "option": "u16"
          }
        },
        {
          "name": "deployer",
          "type": {
            "option": "pubkey"
          }
        },
        {
          "name": "treasury",
          "type": {
            "option": "pubkey"
          }
        }
      ]
    },
    {
      "name": "withdraw",
      "docs": [
        "Withdraw SOL from the vault"
      ],
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "depositor",
          "writable": true,
          "signer": true
        },
        {
          "name": "depositorRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  112,
                  111,
                  115,
                  105,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "depositor"
              }
            ]
          }
        },
        {
          "name": "protocolConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "depositorRecord",
      "discriminator": [
        120,
        180,
        8,
        71,
        198,
        212,
        93,
        187
      ]
    },
    {
      "name": "loan",
      "discriminator": [
        20,
        195,
        70,
        117,
        165,
        227,
        182,
        1
      ]
    },
    {
      "name": "protocolConfig",
      "discriminator": [
        207,
        91,
        250,
        28,
        152,
        179,
        215,
        209
      ]
    }
  ],
  "events": [
    {
      "name": "authorityReclaimed",
      "discriminator": [
        216,
        107,
        174,
        145,
        179,
        21,
        100,
        39
      ]
    },
    {
      "name": "authorityTransferred",
      "discriminator": [
        245,
        109,
        179,
        54,
        135,
        92,
        22,
        64
      ]
    },
    {
      "name": "configUpdated",
      "discriminator": [
        40,
        241,
        230,
        122,
        11,
        19,
        198,
        194
      ]
    },
    {
      "name": "deposited",
      "discriminator": [
        111,
        141,
        26,
        45,
        161,
        35,
        100,
        57
      ]
    },
    {
      "name": "loanDeployed",
      "discriminator": [
        155,
        211,
        222,
        135,
        40,
        145,
        42,
        232
      ]
    },
    {
      "name": "loanRecovered",
      "discriminator": [
        202,
        40,
        127,
        156,
        8,
        189,
        127,
        124
      ]
    },
    {
      "name": "loanRepaid",
      "discriminator": [
        202,
        183,
        88,
        60,
        211,
        54,
        142,
        243
      ]
    },
    {
      "name": "loanRequested",
      "discriminator": [
        222,
        179,
        241,
        111,
        102,
        135,
        56,
        56
      ]
    },
    {
      "name": "protocolInitialized",
      "discriminator": [
        173,
        122,
        168,
        254,
        9,
        118,
        76,
        132
      ]
    },
    {
      "name": "protocolPausedChanged",
      "discriminator": [
        201,
        234,
        98,
        203,
        146,
        119,
        72,
        122
      ]
    },
    {
      "name": "solReclaimed",
      "discriminator": [
        195,
        98,
        132,
        99,
        16,
        80,
        33,
        98
      ]
    },
    {
      "name": "withdrawn",
      "discriminator": [
        20,
        89,
        223,
        198,
        194,
        124,
        219,
        13
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "protocolPaused",
      "msg": "Protocol is currently paused"
    },
    {
      "code": 6001,
      "name": "invalidAmount",
      "msg": "Invalid amount provided"
    },
    {
      "code": 6002,
      "name": "insufficientBalance",
      "msg": "Insufficient balance"
    },
    {
      "code": 6003,
      "name": "insufficientLiquidity",
      "msg": "Insufficient liquidity in vault"
    },
    {
      "code": 6004,
      "name": "invalidDuration",
      "msg": "Invalid duration"
    },
    {
      "code": 6005,
      "name": "invalidInterestRate",
      "msg": "Invalid interest rate"
    },
    {
      "code": 6006,
      "name": "invalidAdminFee",
      "msg": "Invalid admin fee"
    },
    {
      "code": 6007,
      "name": "loanNotActive",
      "msg": "Loan is not active"
    },
    {
      "code": 6008,
      "name": "unauthorizedBorrower",
      "msg": "Unauthorized borrower"
    },
    {
      "code": 6009,
      "name": "loanNotExpired",
      "msg": "Loan has not expired yet"
    },
    {
      "code": 6010,
      "name": "loanNotRecovered",
      "msg": "Loan has not been recovered"
    },
    {
      "code": 6011,
      "name": "loanNotRepaid",
      "msg": "Loan has not been repaid"
    },
    {
      "code": 6012,
      "name": "unauthorized",
      "msg": "Unauthorized action"
    },
    {
      "code": 6013,
      "name": "invalidParameter",
      "msg": "Invalid parameter"
    },
    {
      "code": 6014,
      "name": "unauthorizedDepositor",
      "msg": "Unauthorized depositor"
    },
    {
      "code": 6015,
      "name": "invalidLoanId",
      "msg": "Invalid loan ID"
    },
    {
      "code": 6016,
      "name": "programAlreadySet",
      "msg": "Program already set for this loan"
    },
    {
      "code": 6017,
      "name": "invalidProgram",
      "msg": "Invalid program pubkey"
    }
  ],
  "types": [
    {
      "name": "authorityReclaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "loanId",
            "type": "u64"
          },
          {
            "name": "programPubkey",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "authorityTransferred",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "programPubkey",
            "type": "pubkey"
          },
          {
            "name": "newAuthority",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "configUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "adminFeeSplitBps",
            "type": "u16"
          },
          {
            "name": "defaultInterestRateBps",
            "type": "u16"
          },
          {
            "name": "defaultAdminFeeBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "deposited",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "depositor",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "totalDeposits",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "depositorRecord",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "depositedAmount",
            "type": "u64"
          },
          {
            "name": "shareAmount",
            "type": "u64"
          },
          {
            "name": "lastUpdateTs",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "loan",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "loanId",
            "type": "u64"
          },
          {
            "name": "borrower",
            "type": "pubkey"
          },
          {
            "name": "programPubkey",
            "type": "pubkey"
          },
          {
            "name": "principal",
            "type": "u64"
          },
          {
            "name": "duration",
            "type": "i64"
          },
          {
            "name": "interestRateBps",
            "type": "u16"
          },
          {
            "name": "adminFeeBps",
            "type": "u16"
          },
          {
            "name": "adminFeePaid",
            "type": "u64"
          },
          {
            "name": "startTs",
            "type": "i64"
          },
          {
            "name": "state",
            "type": {
              "defined": {
                "name": "loanState"
              }
            }
          },
          {
            "name": "authorityPda",
            "type": "pubkey"
          },
          {
            "name": "repaidTs",
            "type": {
              "option": "i64"
            }
          },
          {
            "name": "recoveredTs",
            "type": {
              "option": "i64"
            }
          },
          {
            "name": "interestPaid",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "reclaimedAmount",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "reclaimedTs",
            "type": {
              "option": "i64"
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "loanDeployed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "loanId",
            "type": "u64"
          },
          {
            "name": "programPubkey",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "loanRecovered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "loanId",
            "type": "u64"
          },
          {
            "name": "adminFeeDistributed",
            "type": "u64"
          },
          {
            "name": "depositorShare",
            "type": "u64"
          },
          {
            "name": "treasuryShare",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "loanRepaid",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "loanId",
            "type": "u64"
          },
          {
            "name": "totalRepaid",
            "type": "u64"
          },
          {
            "name": "interestPaid",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "loanRequested",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "borrower",
            "type": "pubkey"
          },
          {
            "name": "loanId",
            "type": "u64"
          },
          {
            "name": "principal",
            "type": "u64"
          },
          {
            "name": "duration",
            "type": "i64"
          },
          {
            "name": "interestRateBps",
            "type": "u16"
          },
          {
            "name": "adminFee",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "loanState",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "repaid"
          },
          {
            "name": "recovered"
          },
          {
            "name": "pending"
          },
          {
            "name": "repaidPendingTransfer"
          }
        ]
      }
    },
    {
      "name": "protocolConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "deployer",
            "type": "pubkey"
          },
          {
            "name": "adminFeeSplitBps",
            "type": "u16"
          },
          {
            "name": "defaultInterestRateBps",
            "type": "u16"
          },
          {
            "name": "defaultAdminFeeBps",
            "type": "u16"
          },
          {
            "name": "totalDeposits",
            "type": "u64"
          },
          {
            "name": "totalLoansOutstanding",
            "type": "u64"
          },
          {
            "name": "totalYieldDistributed",
            "type": "u64"
          },
          {
            "name": "loanCounter",
            "type": "u64"
          },
          {
            "name": "isPaused",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "protocolInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "protocolPausedChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "isPaused",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "solReclaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "loanId",
            "type": "u64"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "totalReclaimed",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "withdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "depositor",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "remainingBalance",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
