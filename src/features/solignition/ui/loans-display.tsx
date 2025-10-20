import { UiWalletAccount, ellipsify } from '@wallet-ui/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AppExplorerLink } from '@/components/app-explorer-link'
import { useLoansByBorrower } from '../data-access/use-loans'
import { useRepayLoanMutation } from '../data-access/use-repay-loan-mutation'
import { LoanState } from '@project/anchor'

export function LoansDisplay({ account }: { account: UiWalletAccount }) {
  const loansQuery = useLoansByBorrower(account.address)
  const repayMutation = useRepayLoanMutation({ account })

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

  const calculateTotalOwed = (principal: bigint, interestRateBps: number) => {
    const interest = (principal * BigInt(interestRateBps)) / 10000n
    return principal + interest
  }

  if (loansQuery.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>My Loans</CardTitle>
          <CardDescription>Loading your loans...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!loansQuery.data || loansQuery.data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>My Loans</CardTitle>
          <CardDescription>You haven't requested any loans yet</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Request a loan from the Borrow tab to get started.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">My Loans ({loansQuery.data.length})</h2>

      <div className="grid gap-4">
        {loansQuery.data.map((loan) => {
          console.log("loan data: ", loan)
          const totalOwed = calculateTotalOwed(loan.data.principal, loan.data.interestRateBps)
          const isActive = loan.data.state === LoanState.Active

          return (
            <Card key={loan.address}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      Loan #{loan.data.loanId.toString()}
                      {getLoanStateBadge(loan.data.state)}
                    </CardTitle>
                    <CardDescription>
                      <AppExplorerLink address={loan.address} label={ellipsify(loan.address)} />
                    </CardDescription>
                  </div>
                  {isActive && (
                    <Button
                      onClick={() =>
                        repayMutation.mutateAsync({
                          loanAddress: loan.address,
                          programData: loan.data.programPubkey,
                        })
                      }
                      disabled={repayMutation.isPending}
                    >
                      {repayMutation.isPending ? 'Repaying...' : 'Repay Loan'}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Principal</p>
                    <p className="text-lg font-semibold">{formatSOL(loan.data.principal)} SOL</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Interest Rate</p>
                    <p className="text-lg font-semibold">{(loan.data.interestRateBps / 100).toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Owed</p>
                    <p className="text-lg font-semibold">{formatSOL(totalOwed)} SOL</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Start Date</p>
                    <p className="text-lg font-semibold">{formatDate(loan.data.startTs)}</p>
                  </div>
                </div>

                {loan.data.programPubkey !== '11111111111111111111111111111111' && (
                  <div className="mt-4">
                    <p className="text-sm text-muted-foreground">Deployed Program</p>
                    <AppExplorerLink
                      address={loan.data.programPubkey}
                      label={ellipsify(loan.data.programPubkey)}
                    />
                  </div>
                )}

                {loan.data.repaidTs && (
                  <div className="mt-2 text-sm text-muted-foreground">
                    Repaid on: {formatDate(loan.data.repaidTs.value)}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}