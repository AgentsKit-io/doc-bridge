import { Command } from 'commander'
const program = new Command()
program.command('report').option('-b, --brief', 'Short report').action(() => {})
program.parse()
