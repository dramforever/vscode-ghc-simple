import * as path from 'path';
import { glob } from 'glob';
import * as Mocha from 'mocha';


export async function run(): Promise<void> {
	// Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd',
		timeout: 30000,
		color: true
	});

	const testsRoot = __dirname;

	return new Promise((c, e) => {
		glob('**/**.test.js', { cwd: testsRoot }, (_, files) => {

            // Add files to the test suite
            files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

            try {
                // Run the mocha test
                mocha.run(failures => {
                    if (failures > 0) {
                        e(new Error(`${failures} tests failed.`));
                    } else {
                        c();
                    }
                });
            } catch (err) {
                console.error(err);
                e(err);
            }
        })
    });        
}
