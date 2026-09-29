import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function StockValuationPanel({ ticker }: { ticker: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Estimativa de valor indisponível</CardTitle>
        <CardDescription>
          O InvestLab ainda não pode apresentar uma estimativa confiável para{" "}
          {ticker}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Não é necessário preencher dados ou realizar qualquer ação.
        </p>
      </CardContent>
    </Card>
  );
}
