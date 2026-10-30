package peval2acda2627;

import java.sql.Connection;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDate;

public class RegistroCaso {

    public static void registrar(Connection con, String dni, String tipoTexto, String comisariaTexto,
                                 String descripcion, String placa) throws SQLException {
        dni = dni.toUpperCase();
        if (dni.isEmpty() || !existe(con, "SELECT 1 FROM ciudadanos WHERE dni = ?", dni)) {
            System.out.println("No se puede registrar el caso: no existe ningún ciudadano con DNI '" + dni + "'");
            return;
        }
        Integer idTipo = entero(tipoTexto);
        if (idTipo == null || !existe(con, "SELECT 1 FROM tipos_delito WHERE id = ?", idTipo)) {
            System.out.println("No se puede registrar el caso: el tipo de delito '" + tipoTexto + "' no existe");
            return;
        }
        Integer idComisaria = entero(comisariaTexto);
        if (idComisaria == null || !existe(con, "SELECT 1 FROM comisarias WHERE id = ?", idComisaria)) {
            System.out.println("No se puede registrar el caso: la comisaría '" + comisariaTexto + "' no existe");
            return;
        }
        if (descripcion.isEmpty()) {
            System.out.println("No se puede registrar el caso: la descripción está vacía");
            return;
        }
        if (descripcion.length() > 200) {
            System.out.println("No se puede registrar el caso: la descripción supera los 200 caracteres ("
                    + descripcion.length() + ")");
            return;
        }
        try (PreparedStatement ps = con.prepareStatement("SELECT id_comisaria FROM agentes WHERE placa = ?")) {
            ps.setString(1, placa);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    System.out.println("No se puede registrar el caso: no existe ningún agente con placa '"
                            + placa + "'");
                    return;
                }
                if (rs.getInt(1) != idComisaria) {
                    System.out.println("No se puede registrar el caso: el agente " + placa
                            + " pertenece a la comisaría " + rs.getInt(1) + ", no a la " + idComisaria);
                    return;
                }
            }
        }

        Date hoy = Date.valueOf(LocalDate.now());
        con.setAutoCommit(false);
        try (PreparedStatement caso = con.prepareStatement(
                "INSERT INTO casos (fecha_apertura, descripcion, id_tipo, dni_denunciante, id_comisaria, estado) "
                        + "VALUES (?,?,?,?,?,'ABIERTO')", Statement.RETURN_GENERATED_KEYS);
             PreparedStatement asig = con.prepareStatement(
                     "INSERT INTO asignaciones (id_caso, placa_agente, rol, fecha_asignacion) "
                             + "VALUES (?,?,'INSTRUCTOR',?)")) {
            caso.setDate(1, hoy);
            caso.setString(2, descripcion);
            caso.setInt(3, idTipo);
            caso.setString(4, dni);
            caso.setInt(5, idComisaria);
            caso.executeUpdate();
            int idCaso;
            try (ResultSet keys = caso.getGeneratedKeys()) {
                keys.next();
                idCaso = keys.getInt(1);
            }
            asig.setInt(1, idCaso);
            asig.setString(2, placa);
            asig.setDate(3, hoy);
            asig.executeUpdate();
            con.commit();
            System.out.println("Caso " + idCaso + " registrado (ABIERTO, instructor " + placa + ")");
        } catch (SQLException e) {
            con.rollback();
            throw e;
        } finally {
            con.setAutoCommit(true);
        }
    }

    private static Integer entero(String texto) {
        try {
            return Integer.parseInt(texto);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static boolean existe(Connection con, String sql, Object valor) throws SQLException {
        try (PreparedStatement ps = con.prepareStatement(sql)) {
            ps.setObject(1, valor);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        }
    }
}
