import { useState } from 'react'
import { UiWalletAccount, ellipsify } from '@wallet-ui/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AppExplorerLink } from '@/components/app-explorer-link'
import { useLoans } from '../data-access/use-loans'
import { useRecoverLoanMutation } from '../data-access/use-recover-loan-mutation'
import { useSetDeployedProgramMutation } from '../data-access/use-set-deployed-program-mutation'
import { LoanState } from '@project/anchor'
import { address } from '@solana/kit'

export function AdminLoansManagement({ account }: { account: UiWalletAccount }) {
  const [selectedLoanId, setSelectedLoanId] = useState<bigint | null>(null)
  const [programAddress, setProgramAddress] = useState('')

  const loansQuery = useLoans(account.address)
  const recoverMutation = useRecoverLoanMutation({ account })
  const setDeployedProgramMutation = useSetDeployedProgramMutation({ account })

  const formatSOL = (lamports: bigint) => {
    return (Number(lamports) / 1_000_000_000).toFixed(4)
  }

  const formatDate = (timestamp: bigint) => {
    return new Date(Number(timestamp) * 1000).toLocaleDateString()
  }

  const getLoanStateBadge = (state: number) => {
    switch (state) {
      case LoanState.Active:
        return <Badge className="bg-green-500">Active</Badge>
      case LoanState.Repaid:
        return <Badge className="bg-blue-500">Repaid</Badge>
      case LoanState.Recovered:
        return <Badge variant="destructive">Recovered</Badge>
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
  }

  const isLoanExpired = (loan: any) => {
    const expiryTime = Number(loan.data.startTs) + Number(loan.data.duration)
    return Date.now() / 1000 > expiryTime
  }

  const handleRecoverLoan = async (loanAddress: string) => {
    await recoverMutation.mutateAsync(loanAddress as any)
  }

  const handleSetProgram = async () => {
    if (!selectedLoanId || !programAddress) return

    await setDeployedProgramMutation.mutateAsync({
      loanId: selectedLoanId,
      programPubkey: address(programAddress),
    })

    setSelectedLoanId(null)
    setProgramAddress('')
  }

  if (loansQuery.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loan Management</CardTitle>
          <CardDescription>Loading loans...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const activeLoans = loansQuery.data?.filter((loan) => loan.data.state === LoanState.Active) || []
  const expiredLoans = activeLoans.filter(isLoanExpired)

  return (
    <div className="space-y-4">
      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Loans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loansQuery.data?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Loans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeLoans.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Expired Loans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{expiredLoans.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Set Deployed Program */}
      <Card>
        <CardHeader>
          <CardTitle>Set Deployed Program</CardTitle>
          <CardDescription>Record a deployed program for a loan</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="loan-id">Loan ID</Label>
            <Input
              id="loan-id"
              type="number"
              min="0"
              placeholder="0"
              value={selectedLoanId?.toString() || ''}
              onChange={(e) => setSelectedLoanId(e.target.value ? BigInt(e.target.value) : null)}
              disabled={setDeployedProgramMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="program-address">Program Address</Label>
            <Input
              id="program-address"
              type="text"
              placeholder="Solana program address"
              value={programAddress}
              onChange={(e) => setProgramAddress(e.target.value)}
              disabled={setDeployedProgramMutation.isPending}
            />
          </div>

          <Button
            onClick={handleSetProgram}
            disabled={setDeployedProgramMutation.isPending || !selectedLoanId || !programAddress}
            className="w-full"
          >
            {setDeployedProgramMutation.isPending ? 'Setting...' : 'Set Deployed Program'}
          </Button>
        </CardContent>
      </Card>

      {/* Expired Loans List */}
      {expiredLoans.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Expired Loans (Recoverable)</CardTitle>
            <CardDescription>These loans have expired and can be recovered</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {expiredLoans.map((loan) => (
                <Card key={loan.address}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                          Loan #{loan.data.loanId.toString()}
                          {getLoanStateBadge(loan.data.state)}
                        </CardTitle>
                        <CardDescription>
                          <AppExplorerLink address={loan.address} label={ellipsify(loan.address)} />
                        </CardDescription>
                      </div>
                      <Button
                        onClick={() => handleRecoverLoan(loan.address)}
                        disabled={recoverMutation.isPending}
                        variant="destructive"
                        size="sm"
                      >
                        {recoverMutation.isPending ? 'Recovering...' : 'Recover'}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Borrower</p>
                        <AppExplorerLink address={loan.data.borrower} label={ellipsify(loan.data.borrower)} />
                      </div>
                      <div>
                        <p className="text-muted-foreground">Principal</p>
                        <p className="font-semibold">{formatSOL(loan.data.principal)} SOL</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Start Date</p>
                        <p className="font-semibold">{formatDate(loan.data.startTs)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Duration</p>
                        <p className="font-semibold">{(Number(loan.data.duration) / 86400).toFixed(0)} days</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Loans List */}
      <Card>
        <CardHeader>
          <CardTitle>All Loans</CardTitle>
          <CardDescription>Complete list of all loans in the protocol</CardDescription>
        </CardHeader>
        <CardContent>
          {loansQuery.data && loansQuery.data.length > 0 ? (
            <div className="space-y-3">
              {loansQuery.data.map((loan) => (
                <div
                  key={loan.address}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="font-medium">Loan #{loan.data.loanId.toString()}</p>
                      <p className="text-sm text-muted-foreground">
                        <AppExplorerLink address={loan.address} label={ellipsify(loan.address)} />
                      </p>
                    </div>
                    {getLoanStateBadge(loan.data.state)}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatSOL(loan.data.principal)} SOL</p>
                    <p className="text-sm text-muted-foreground">
                      {ellipsify(loan.data.borrower)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No loans yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}