package peval2acda2627;

import java.io.File;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerException;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;
import org.w3c.dom.Document;
import org.w3c.dom.Element;

public class ExportarXml {

    public static void exportar(Connection con, int idComisaria)
            throws SQLException, ParserConfigurationException, TransformerException {
        Document doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().newDocument();

        Element raiz = doc.createElement("comisaria");
        try (PreparedStatement ps = con.prepareStatement("SELECT nombre FROM comisarias WHERE id = ?")) {
            ps.setInt(1, idComisaria);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    System.out.println("No existe la comisaría " + idComisaria);
                    return;
                }
                raiz.setAttribute("id", String.valueOf(idComisaria));
                raiz.setAttribute("nombre", rs.getString(1));
            }
        }
        doc.appendChild(raiz);

        int casos = 0;
        try (PreparedStatement ps = con.prepareStatement(
                "SELECT c.id, c.estado, c.fecha_apertura, t.gravedad, t.descripcion, c.descripcion, "
                        + "c.dni_denunciante, d.nombre "
                        + "FROM casos c JOIN tipos_delito t ON t.id = c.id_tipo "
                        + "JOIN ciudadanos d ON d.dni = c.dni_denunciante "
                        + "WHERE c.id_comisaria = ? ORDER BY c.id");
             PreparedStatement psAgentes = con.prepareStatement(
                     "SELECT a.placa_agente, a.rol, ag.nombre FROM asignaciones a "
                             + "JOIN agentes ag ON ag.placa = a.placa_agente WHERE a.id_caso = ? "
                             + "ORDER BY a.rol = 'INSTRUCTOR' DESC, a.placa_agente")) {
            ps.setInt(1, idComisaria);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    casos++;
                    int idCaso = rs.getInt(1);
                    Element caso = doc.createElement("caso");
                    caso.setAttribute("id", String.valueOf(idCaso));
                    caso.setAttribute("estado", rs.getString(2));
                    raiz.appendChild(caso);

                    hijo(doc, caso, "fecha_apertura", rs.getDate(3).toString());
                    Element tipo = hijo(doc, caso, "tipo", rs.getString(5));
                    tipo.setAttribute("gravedad", rs.getString(4));
                    hijo(doc, caso, "descripcion", rs.getString(6));
                    Element den = hijo(doc, caso, "denunciante", rs.getString(8));
                    den.setAttribute("dni", rs.getString(7));

                    Element agentes = doc.createElement("agentes");
                    caso.appendChild(agentes);
                    psAgentes.setInt(1, idCaso);
                    try (ResultSet ra = psAgentes.executeQuery()) {
                        while (ra.next()) {
                            Element ag = hijo(doc, agentes, "agente", ra.getString(3));
                            ag.setAttribute("placa", ra.getString(1));
                            ag.setAttribute("rol", ra.getString(2));
                        }
                    }
                }
            }
        }

        Transformer t = TransformerFactory.newInstance().newTransformer();
        t.setOutputProperty(OutputKeys.INDENT, "yes");
        t.setOutputProperty(OutputKeys.ENCODING, "UTF-8");
        t.setOutputProperty("{http://xml.apache.org/xslt}indent-amount", "4");
        File fichero = new File("comisaria_" + idComisaria + ".xml");
        t.transform(new DOMSource(doc), new StreamResult(fichero));
        System.out.println("Generado " + fichero.getName() + " con " + casos + " caso(s)");
    }

    private static Element hijo(Document doc, Element padre, String nombre, String texto) {
        Element e = doc.createElement(nombre);
        e.setTextContent(texto);
        padre.appendChild(e);
        return e;
    }
}
