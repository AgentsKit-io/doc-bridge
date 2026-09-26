import ecosystem from '../../../ecosystem.json'
import { PRODUCT_ID, PRODUCT_REPO } from '@/lib/shell'
import { BASE_PATH } from '@/lib/site'

const products = ecosystem.products
  .filter((product) => product.public && product.navigation.showInBar)
  .sort((left, right) => left.navigation.order - right.navigation.order)

/**
 * Shared AgentsKit footer. The children are a minimal static fallback so the ecosystem,
 * repository, and license links exist in the exported HTML; shell v1 replaces them on upgrade.
 */
export function SiteFooter() {
  return (
    <agentskit-footer current={PRODUCT_ID} repo={PRODUCT_REPO}>
      <footer className="ak-footer-fallback" aria-label="AgentsKit ecosystem">
        <nav aria-label="AgentsKit products">
          <ul>
            {products.map((product) => (
              <li key={product.id}>
                <a href={product.surfaces.home} aria-current={product.id === PRODUCT_ID ? 'page' : undefined}>
                  {product.shortName}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <p>
          <a href={`https://github.com/${PRODUCT_REPO}`}>GitHub repository</a>
          {' · '}
          <a href={`https://github.com/${PRODUCT_REPO}/blob/master/LICENSE`}>MIT License</a>
          {' · '}
          <a href={`${BASE_PATH}/llms.txt`}>llms.txt</a>
        </p>
      </footer>
    </agentskit-footer>
  )
}
