import { test, expect } from '@playwright/test';
import { moduleScreens } from '../../apps/web/src/module-catalog.js';
test('every module workspace renders with clear authority boundaries and mobile containment', async ({page}) => {
  test.setTimeout(120_000);
  await page.route('**/api/v1/identity/config', route => route.fulfill({json:{provider:'development'}}));
  const viewports = [320, 390, 768, 900, 1024, 1280, 1440];
  for (const screen of moduleScreens) {
    await page.goto(`/?module=${screen.module}&view=${screen.id}`);
    await expect(page.getByRole('navigation',{name:'Module workspaces'}).getByRole('button',{name:screen.title,exact:true})).toHaveAttribute('aria-current','page');
    await expect(page.locator('main h1')).toBeVisible();
    if (!screen.endpoint && screen.fields.length > 0 && screen.id!=='trial-balance') await expect(page.getByText('Preparation only',{exact:true})).toBeVisible();
    if (!screen.endpoint && screen.fields.length > 0) {
      const unnamedFields = await page.locator('.editor-panel form :is(input,select,textarea)').evaluateAll(elements => elements.filter(element => !(element as HTMLInputElement).name).length);
      expect(unnamedFields, `${screen.id} form fields need stable names`).toBe(0);
      const emailField = screen.fields.find(field => field.type === 'email');
      if (emailField) await expect(page.locator(`#${screen.id}-${emailField.key}`)).toHaveAttribute('autocomplete', 'email');
    }
    for (const width of viewports) {
      await page.setViewportSize({width,height:844});
      const layout = await page.evaluate(() => {
        const smallTargets = [...document.querySelectorAll<HTMLElement>('button,input:not([type="file"]):not([type="checkbox"]):not([type="radio"]),select,textarea,[role="button"],label.button,.variable-options label,label:has(input[type="checkbox"]),label:has(input[type="radio"])')]
          .filter(element => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
          })
          .filter(element => element.getBoundingClientRect().height < 44)
          .map(element => `${element.tagName.toLowerCase()}: ${element.textContent?.trim() || element.getAttribute('aria-label') || element.getAttribute('name') || element.id}`);
        const overflowing = [...document.querySelectorAll<HTMLElement>('*')]
          .filter(element => {
            const rect = element.getBoundingClientRect();
            return rect.right > innerWidth + 1 || element.scrollWidth > element.clientWidth + 1;
          })
          .slice(0, 12)
          .map(element => `${element.tagName.toLowerCase()}.${String(element.className).replaceAll(' ', '.')}#${element.id}(${Math.round(element.getBoundingClientRect().right)}/${element.clientWidth}/${element.scrollWidth})`);
        return { documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, smallTargets, overflowing };
      });
      expect(layout.documentWidth, `${screen.id} overflows at ${width}px: ${layout.overflowing.join(', ')}`).toBeLessThanOrEqual(layout.viewportWidth);
      if (width <= 390) expect(layout.smallTargets, `${screen.id} has undersized touch targets at ${width}px`).toEqual([]);
    }
  }
});
test('Practice expenses creates and posts a classified journal through the real API boundary', async ({page}) => {
  await page.route('**/api/v1/identity/config', route => route.fulfill({json:{provider:'development'}}));
  const ids = { expense:'10000000-0000-4000-8000-000000000001', cash:'10000000-0000-4000-8000-000000000002', payable:'10000000-0000-4000-8000-000000000003', period:'10000000-0000-4000-8000-000000000005', journal:'10000000-0000-4000-8000-000000000006' };
  const ledger = {currency:'QAR',accounts:[
    {id:ids.expense,code:'500',name:'Office rent',kind:'EXPENSE',active:true,posting:true},
    {id:ids.cash,code:'100',name:'Cash',kind:'ASSET',active:true,posting:true},
    {id:ids.payable,code:'210',name:'Accrued expenses',kind:'LIABILITY',active:true,posting:true},
  ],periods:[{id:ids.period,startsOn:'2026-01-01',endsOn:'2026-12-31',closed:false,version:1,lastTransitionReason:''}],journals:[],expenses:[{id:ids.journal,journalId:ids.journal,reference:'EXP-E2E-1',category:'OFFICE_RENT_FACILITIES',amount:'1250.250000',creditAccountId:ids.payable,journalStatus:'POSTED',journalVersion:2,settledAmount:'0.000000',outstandingAmount:'1250.250000',settlementAllowed:true,receipts:[],receiptAttachable:true}],balances:[]};
  const journal = {id:ids.journal,periodId:ids.period,accountingDate:'2026-10-04',reference:'EXP-E2E-1',memo:'[OFFICE_RENT_FACILITIES] October rent',status:'DRAFT',version:1,postedAt:null,reversalOf:null,lines:[]};
  let draftRequest: unknown; let postRequest: unknown; let settlementRequest: unknown;
  await page.route('**/api/v1/engagements/*/practice**', async route => {
    const request=route.request(); const url=new URL(request.url());
    if(request.method()==='POST' && url.pathname.endsWith('/expenses/drafts')) { draftRequest=request.postDataJSON(); await route.fulfill({json:journal}); }
    else if(request.method()==='POST' && url.pathname.endsWith(`/expenses/${ids.journal}/settlements`)) { settlementRequest=request.postDataJSON(); await route.fulfill({json:{...journal,id:'10000000-0000-4000-8000-000000000008',reference:'SETTLE-E2E-1',memo:'[EXPENSE_SETTLEMENT] EXP-E2E-1',status:'POSTED',version:2,postedAt:'2026-10-04T00:00:00.000Z'}}); }
    else if(request.method()==='POST' && url.pathname.endsWith(`/journals/${ids.journal}/post`)) { postRequest=request.postDataJSON(); await route.fulfill({json:{...journal,status:'POSTED',version:2,postedAt:'2026-10-04T00:00:00.000Z'}}); }
    else await route.fulfill({json:ledger});
  });
  await page.goto('/?module=Practice&view=expenses');
  await page.getByLabel('Local development access token').fill('synthetic-practice-token');
  await page.getByRole('button',{name:'Load accounts'}).click();
  await expect(page.getByRole('heading',{name:'New recognition entry'})).toBeVisible();
  await page.getByLabel('Category').selectOption('OFFICE_RENT_FACILITIES');
  await page.locator('#expense-period').selectOption(ids.period);
  await page.locator('#expense-date').fill('2026-10-04');
  await page.locator('#expense-reference').fill('EXP-E2E-1');
  await page.locator('#expense-amount').fill('1250.25');
  await page.getByLabel('Classification account').selectOption(ids.expense);
  await page.getByLabel('Counterpart account').selectOption(ids.payable);
  await page.getByLabel('Description').fill('October rent');
  await page.getByRole('button',{name:'Create journal draft'}).click();
  await expect(page.getByRole('heading',{name:'Expense journal draft created'})).toBeVisible();
  expect(draftRequest).toMatchObject({category:'OFFICE_RENT_FACILITIES',amount:'1250.25',debitAccountId:ids.expense,creditAccountId:ids.payable});
  await page.getByRole('button',{name:'Post through firm policy'}).click();
  await expect(page.getByText('Expense journal posted through approved policy, period, and balance controls.')).toBeVisible();
  expect(postRequest).toMatchObject({expectedVersion:1});
  await page.getByLabel('Open expense obligation').selectOption(ids.journal);
  await page.locator('#settlement-period').selectOption(ids.period);
  await page.getByLabel('Payment accounting date').fill('2026-10-04');
  await page.getByLabel('Payment reference').fill('PAY-E2E-1');
  await page.locator('#settlement-amount').fill('1250.25');
  await page.getByLabel('Cash / asset account').selectOption(ids.cash);
  await page.getByRole('button',{name:'Record and post settlement'}).click();
  await expect(page.getByText('Expense obligation settled through a separate posted journal. The outstanding balance has been refreshed.')).toBeVisible();
  expect(settlementRequest).toMatchObject({periodId:ids.period,amount:'1250.25',assetAccountId:ids.cash});
});
test('session drafts survive module navigation and browser history preserves the workspace', async ({page}) => {
  await page.route('**/api/v1/identity/config',route=>route.fulfill({json:{provider:'development'}}));
  await page.goto('/?module=Commercial&view=leads');
  await page.getByLabel('Legal entity name').fill('Synthetic draft');
  await page.getByRole('navigation',{name:'Business modules'}).getByRole('button',{name:'Governance',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Acceptance & continuance',exact:true})).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel('Legal entity name')).toHaveValue('Synthetic draft');
  await page.getByRole('button',{name:'Clear draft',exact:true}).click();
  await expect(page.getByLabel('Legal entity name')).toHaveValue('');
});
test('protected risk submission requires confirmation and displays server authorization errors',async({page})=>{
  await page.route('**/api/v1/identity/config',route=>route.fulfill({json:{provider:'development'}}));
  await page.route('**/api/v1/engagements/*/risks',route=>route.fulfill({status:403,json:{error:{message:'Forbidden'}}}));
  await page.goto('/?module=Governance&view=risks');
  await page.getByLabel('Local development access token').fill('synthetic-test-token');
  await page.getByLabel('Risk title').fill('Synthetic risk'); await page.getByLabel('Risk description').fill('Synthetic description');
  await page.getByRole('button',{name:/Review create risk/i}).click();
  await expect(page.getByRole('heading',{name:'Confirm engagement submission'})).toBeVisible();
  await page.getByRole('button',{name:'Confirm and submit'}).click();
  await expect(page.getByRole('alert')).toContainText('does not allow');
  await page.screenshot({path:'test-results/ui-modules-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-results/ui-modules-mobile.png',fullPage:true});
});
test('journal posting reviews protected lines and binds the loaded optimistic version',async({page})=>{
  await page.route('**/api/v1/identity/config',route=>route.fulfill({json:{provider:'development'}}));
  const journal={id:'journal-a',reference:'SYNTHETIC-1',memo:'Acceptance fixture',status:'DRAFT',version:3};
  let posted:unknown;
  await page.route('**/api/v1/engagements/*/adjustments**',async route=>{
    const request=route.request();
    if(request.method()==='POST') { posted=request.postDataJSON(); await route.fulfill({json:{...journal,status:'POSTED'}}); }
    else if(request.url().endsWith('/journal-a')) await route.fulfill({json:{...journal,lines:[{accountCode:'1000',debit:'10.000000',credit:'0.000000'},{accountCode:'2000',debit:'0.000000',credit:'10.000000'}]}});
    else await route.fulfill({json:[journal]});
  });
  await page.goto('/?module=Fieldwork&view=adjustments');
  await page.getByLabel('Local development access token').fill('synthetic-token');
  await page.getByRole('button',{name:'Load records',exact:true}).click();
  await page.getByRole('button',{name:'Review posting',exact:true}).click();
  await expect(page.getByRole('region',{name:'Journal lines for decision'})).toContainText('Exact journal version 3');
  await expect(page.getByRole('region',{name:'Journal lines for decision'})).toContainText('10.000000');
  expect(posted).toBeUndefined();
  await page.getByRole('button',{name:'Record decision',exact:true}).click();
  await expect(page.getByText('Decision recorded on the engagement.',{exact:true})).toBeVisible();
  expect(posted).toEqual({expectedVersion:3});
});
test('lifecycle decisions expose only the commands returned by the server',async({page})=>{
  await page.route('**/api/v1/identity/config',route=>route.fulfill({json:{provider:'development'}}));
  let command:Record<string,unknown>|undefined;
  await page.route('**/api/v1/engagements/*/lifecycle',async route=>{
    if(route.request().method()==='POST') command=route.request().postDataJSON();
    await route.fulfill({json:{state:'FIELDWORK_EXECUTION',version:4,permittedCommands:['SUBMIT_FOR_REVIEW'],history:[]}});
  });
  await page.goto('/?module=Governance&view=lifecycle');
  await page.getByLabel('Local development access token').fill('synthetic-token'); await page.getByRole('button',{name:'Load records',exact:true}).click();
  await page.getByRole('button',{name:'Review workflow transition'}).click();
  await expect(page.getByLabel('Permitted workflow command').getByRole('option')).toHaveCount(2);
  await page.getByLabel('Permitted workflow command').selectOption('SUBMIT_FOR_REVIEW'); await page.getByLabel('Transition reason').fill('Ready for reviewer');
  await page.getByRole('button',{name:'Record decision',exact:true}).click();
  await expect(page.getByText('Decision recorded on the engagement.',{exact:true})).toBeVisible(); expect(command).toMatchObject({command:'SUBMIT_FOR_REVIEW',expectedVersion:4});
});
